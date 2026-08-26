import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { childEnvironment } from '../process-env.js'
import { once } from 'node:events'
import type { JsonRpcLineTransport } from './json-rpc.js'

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

function appendTail(current: string, chunk: string, maxBytes = 16_384): string {
  const next = current + chunk
  return Buffer.byteLength(next, 'utf8') <= maxBytes ? next : next.slice(-maxBytes)
}

function redact(value: string, redactions: readonly string[]): string {
  return redactions.reduce((result, secret) => secret.length === 0 ? result : result.split(secret).join('[REDACTED]'), value)
}

function killProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, signal)
    } else {
      child.kill(signal)
    }
  } catch {
    try { child.kill(signal) } catch { /* already exited */ }
  }
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
        let scrubbed = original
        for (const secret of secrets) {
          if (secret.length > 0) scrubbed = scrubbed.split(secret).join('[REDACTED]')
        }
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
  let running = false
  const scrub = async (): Promise<void> => {
    if (running) return
    running = true
    try { await scrubSecretFiles(root, secrets) } finally { running = false }
  }
  const timer = setInterval(() => { void scrub() }, 100)
  timer.unref?.()
  void scrub()
  return {
    stop: async () => {
      clearInterval(timer)
      await scrub()
    },
  }
}

/** Owns one Codex app-server process and its complete teardown. */
export class CodexProcess {
  readonly child: ChildProcessWithoutNullStreams
  private stderr = ''
  private disposed = false
  private readonly exitPromise: Promise<ProcessExit>
  private readonly closePromise: Promise<void>
  private readonly terminationPromise: Promise<ProcessExit>

  private constructor(
    child: ChildProcessWithoutNullStreams,
    private readonly options: Required<Pick<CodexProcessOptions, 'disposeGraceMs' | 'redactions'>>,
    private readonly scrubber: { readonly stop: () => Promise<void> },
  ) {
    this.child = child
    child.stderr.on('data', chunk => {
      this.stderr = appendTail(this.stderr, redact(String(chunk), options.redactions))
    })
    this.exitPromise = new Promise(resolve => {
      let error: Error | undefined
      child.once('error', value => { error = value instanceof Error ? value : new Error(String(value)) })
      child.once('exit', (code, signal) => resolve({
        code,
        signal,
        stderr: this.stderr,
        ...error === undefined ? {} : { error },
      }))
    })
    this.closePromise = once(child, 'close').then(() => undefined)
    this.terminationPromise = Promise.all([this.exitPromise, this.closePromise]).then(([exit]) => exit)
  }

  static start(options: CodexProcessOptions): CodexProcess {
    const executable = options.executable ?? 'codex'
    const args = [...options.args ?? ['app-server', '--listen', 'stdio://']]
    const env = childEnvironment(options.env)
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const redactions = options.redactions ?? []
    return new CodexProcess(child, {
      disposeGraceMs: options.disposeGraceMs ?? 3_000,
      redactions,
    }, createSecretScrubber(options.env?.['CODEX_HOME'], redactions))
  }

  get stderrTail(): string {
    return this.stderr
  }

  get exited(): Promise<ProcessExit> {
    return this.exitPromise
  }

  async dispose(): Promise<ProcessExit> {
    if (this.disposed) return this.terminationPromise
    this.disposed = true
    this.child.stdin.end()
    const first = await this.waitForTermination(this.options.disposeGraceMs)
    if (first !== undefined) { await this.scrubber.stop(); return first }
    killProcessTree(this.child, 'SIGTERM')
    const second = await this.waitForTermination(this.options.disposeGraceMs)
    if (second !== undefined) { await this.scrubber.stop(); return second }
    killProcessTree(this.child, 'SIGKILL')
    this.child.stdin.destroy()
    this.child.stdout.destroy()
    this.child.stderr.destroy()
    const result = await this.terminationPromise
    await this.scrubber.stop()
    return result
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
}

export async function waitForProcessExit(process: CodexProcess): Promise<ProcessExit> {
  return process.exited
}

export async function waitForChildClose(child: ChildProcessWithoutNullStreams): Promise<void> {
  await once(child, 'close')
}

export function processEnvironmentSecretKeys(): readonly string[] {
  return ['OPENAI_API_KEY', 'CODEX_API_KEY', 'DSH_DEBUG_CODEX_API_KEY']
}
