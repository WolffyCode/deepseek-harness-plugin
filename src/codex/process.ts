import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { childEnvironment } from '../process-env.js'

const DEFAULT_DISPOSE_GRACE_MS = 3_000
const MAX_STDERR_BYTES = 16_384
const REDACTED = '[REDACTED]'

export interface CodexProcessOptions {
  readonly executable?: string
  readonly args?: readonly string[]
  readonly cwd: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly disposeGraceMs?: number
  readonly redactions?: readonly string[]
}

export interface ProcessExit {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stderr: string
  readonly error?: Error
}

interface ObservedExit {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly error?: Error
}

function appendTail(current: string, chunk: string, maxBytes = MAX_STDERR_BYTES): string {
  const next = current + chunk
  if (Buffer.byteLength(next, 'utf8') <= maxBytes) return next
  return Buffer.from(next, 'utf8').subarray(-maxBytes).toString('utf8')
}

function normalizeRedactions(redactions: readonly string[] | undefined): readonly string[] {
  return [...new Set((redactions ?? []).filter(secret => secret.length > 0))]
    .sort((left, right) => right.length - left.length)
}

function redact(value: string, redactions: readonly string[]): string {
  return redactions.reduce((result, secret) => result.split(secret).join(REDACTED), value)
}

function pendingSecretPrefixLength(value: string, redactions: readonly string[]): number {
  const longestSecretLength = redactions[0]?.length ?? 0
  for (let length = Math.min(value.length, longestSecretLength - 1); length > 0; length -= 1) {
    const suffix = value.slice(-length)
    if (redactions.some(secret => secret.startsWith(suffix))) return length
  }
  return 0
}

function killProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): boolean {
  if (child.pid !== undefined && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return true
    } catch {
      // The process group may already have exited; fall back to the direct child.
    }
  }
  try { return child.kill(signal) } catch { return false }
}

async function scrubSecretFiles(root: string | undefined, secrets: readonly string[]): Promise<void> {
  if (root === undefined || secrets.length === 0) return
  const snapshotRoot = join(root, 'shell_snapshots')
  const walk = async (directory: string): Promise<void> => {
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    await Promise.all(entries.map(async entry => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        return
      }
      try {
        const original = await readFile(path, 'utf8')
        const scrubbed = redact(original, secrets)
        if (scrubbed !== original) await writeFile(path, scrubbed, 'utf8')
      } catch {
        // Snapshot files can disappear while Codex rotates them.
      }
    }))
  }
  await walk(snapshotRoot)
}

function createSecretScrubber(root: string | undefined, secrets: readonly string[]): {
  readonly stop: () => Promise<void>
} {
  if (root === undefined || secrets.length === 0) return { stop: async () => {} }
  let running: Promise<void> | undefined
  const scrub = (): Promise<void> => {
    if (running !== undefined) return running
    running = scrubSecretFiles(root, secrets).finally(() => { running = undefined })
    return running
  }
  const timer = setInterval(() => { void scrub() }, 100)
  timer.unref?.()
  void scrub()
  let stopPromise: Promise<void> | undefined
  return {
    stop: (): Promise<void> => {
      if (stopPromise !== undefined) return stopPromise
      clearInterval(timer)
      stopPromise = scrub()
      return stopPromise
    },
  }
}

function childProcessEnvironment(overrides: Readonly<Record<string, string | undefined>> | undefined): NodeJS.ProcessEnv {
  const env = childEnvironment(overrides)
  for (const key of processEnvironmentSecretKeys()) {
    if (overrides?.[key] === undefined) delete env[key]
  }
  return env
}

function disposeGraceMs(value: number | undefined): number {
  const graceMs = value ?? DEFAULT_DISPOSE_GRACE_MS
  if (!Number.isFinite(graceMs) || graceMs < 0) throw new Error('Codex dispose grace must be a finite non-negative number')
  return graceMs
}

/** Owns one Codex app-server process and its complete teardown. */
export class CodexProcess {
  readonly child: ChildProcessWithoutNullStreams
  private stderr = ''
  private stderrPending = ''
  private readonly redactions: readonly string[]
  private readonly exitObservedPromise: Promise<ObservedExit>
  private readonly closePromise: Promise<void>
  private readonly terminationPromise: Promise<ProcessExit>
  private readonly scrubberStopPromise: Promise<void>
  private exitObserved = false
  private closeObserved = false
  private terminated = false
  private streamError: Error | undefined
  private disposePromise: Promise<ProcessExit> | undefined

  private constructor(
    child: ChildProcessWithoutNullStreams,
    private readonly options: Required<Pick<CodexProcessOptions, 'disposeGraceMs'>> & { readonly redactions: readonly string[] },
    private readonly scrubber: { readonly stop: () => Promise<void> },
  ) {
    this.child = child
    this.redactions = options.redactions
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => this.appendStderr(String(chunk)))
    child.stderr.on('end', () => this.flushStderr())
    const observeStreamError = (value: unknown): void => {
      if (this.streamError !== undefined) return
      const error = value instanceof Error ? value : new Error(String(value))
      this.streamError = this.redactError(error)
    }
    child.stderr.on('error', observeStreamError)
    child.stdin.on('error', observeStreamError)

    let resolveExit!: (exit: ObservedExit) => void
    this.exitObservedPromise = new Promise(resolve => { resolveExit = resolve })
    let resolveClose!: () => void
    this.closePromise = new Promise(resolve => { resolveClose = resolve })

    const observeExit = (code: number | null, signal: NodeJS.Signals | null, error?: Error): void => {
      if (this.exitObserved) return
      this.exitObserved = true
      const observedError = error ?? this.streamError
      resolveExit({ code, signal, ...observedError === undefined ? {} : { error: observedError } })
    }
    const observeClose = (): void => {
      if (this.closeObserved) return
      this.closeObserved = true
      this.flushStderr()
      resolveClose()
    }

    child.once('error', value => {
      const error = value instanceof Error ? value : new Error(String(value))
      observeExit(null, null, this.redactError(error))
      // A spawn failure has no child process to wait for. ChildProcess normally
      // emits close as well, but resolving here keeps the failed start deterministic.
      observeClose()
    })
    child.once('exit', (code, signal) => observeExit(code, signal))
    child.once('close', observeClose)

    this.terminationPromise = Promise.all([this.exitObservedPromise, this.closePromise]).then(([exit]) => {
      this.flushStderr()
      this.terminated = true
      return {
        ...exit,
        stderr: this.stderr,
      }
    })
    this.scrubberStopPromise = this.terminationPromise.then(() => this.scrubber.stop())
  }

  static start(options: CodexProcessOptions): CodexProcess {
    const executable = options.executable ?? 'codex'
    const args = [...options.args ?? ['app-server', '--listen', 'stdio://']]
    const graceMs = disposeGraceMs(options.disposeGraceMs)
    const redactions = normalizeRedactions(options.redactions)
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: childProcessEnvironment(options.env),
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return new CodexProcess(child, {
      disposeGraceMs: graceMs,
      redactions,
    }, createSecretScrubber(options.env?.['CODEX_HOME'], redactions))
  }

  get stdin(): ChildProcessWithoutNullStreams['stdin'] { return this.child.stdin }
  get stdout(): ChildProcessWithoutNullStreams['stdout'] { return this.child.stdout }
  get stderrStream(): ChildProcessWithoutNullStreams['stderr'] { return this.child.stderr }
  get stderrTail(): string { return this.stderr }
  get exited(): Promise<ProcessExit> { return this.terminationPromise }

  /** Explicit child-process signals are kept separate from the idempotent close path. */
  kill(signal: NodeJS.Signals): boolean {
    if (this.exitObserved || this.terminated) return false
    return killProcessTree(this.child, signal)
  }

  async dispose(): Promise<ProcessExit> {
    if (this.disposePromise !== undefined) return this.disposePromise
    this.disposePromise = this.disposeOnce()
    return this.disposePromise
  }

  async close(): Promise<ProcessExit> {
    return this.dispose()
  }

  private async disposeOnce(): Promise<ProcessExit> {
    if (this.exitObserved || this.terminated) return this.disposedResult()
    if (!this.child.stdin.destroyed && !this.child.stdin.writableEnded) this.child.stdin.end()

    const graceful = await this.waitForTermination(this.options.disposeGraceMs)
    if (graceful !== undefined) return this.disposedResult()
    if (this.exitObserved || this.terminated) return this.disposedResult()

    killProcessTree(this.child, 'SIGTERM')
    await new Promise<void>(resolve => { setTimeout(resolve, this.options.disposeGraceMs) })
    killProcessTree(this.child, 'SIGKILL')
    this.child.stdin.destroy()
    this.child.stdout.destroy()
    this.child.stderr.destroy()
    return this.disposedResult()
  }

  private async disposedResult(): Promise<ProcessExit> {
    const [exit] = await Promise.all([this.terminationPromise, this.scrubberStopPromise])
    return exit
  }

  private appendStderr(chunk: string): void {
    if (this.redactions.length === 0) {
      this.stderr = appendTail(this.stderr, chunk)
      return
    }
    this.stderrPending += chunk
    const safeLength = this.stderrPending.length - pendingSecretPrefixLength(this.stderrPending, this.redactions)
    if (safeLength <= 0) return
    this.stderr = appendTail(this.stderr, redact(this.stderrPending.slice(0, safeLength), this.redactions))
    this.stderrPending = this.stderrPending.slice(safeLength)
  }

  private flushStderr(): void {
    if (this.stderrPending.length === 0) return
    this.stderr = appendTail(this.stderr, redact(this.stderrPending, this.redactions))
    this.stderrPending = ''
  }

  private async waitForTermination(graceMs: number): Promise<ProcessExit | undefined> {
    let timer: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        this.terminationPromise,
        new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), graceMs) }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  private redactError(error: Error): Error {
    return new Error(redact(error.message, this.redactions), { cause: error.cause })
  }
}

export async function waitForProcessExit(process: CodexProcess): Promise<ProcessExit> {
  return process.exited
}

export async function waitForChildClose(child: ChildProcessWithoutNullStreams): Promise<void> {
  await once(child, 'close')
}

export function processEnvironmentSecretKeys(): readonly string[] {
  return [
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
    'DSH_DEBUG_CODEX_API_KEY',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
  ]
}
