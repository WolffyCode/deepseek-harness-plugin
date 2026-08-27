import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { SpawnOptions, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk'

const MAX_STDERR_BYTES = 16_384
const REDACTED = '[REDACTED]'
type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void
type ErrorListener = (error: Error) => void

type ClaudeProcessOptions = SpawnOptions & {
  readonly redactions?: readonly string[]
}

export interface ClaudeProcessExit {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stderr: string
  readonly error?: Error
}

function appendTail(current: string, chunk: string): string {
  const next = current + chunk
  if (Buffer.byteLength(next, 'utf8') <= MAX_STDERR_BYTES) return next
  let tail = next.slice(-MAX_STDERR_BYTES)
  while (Buffer.byteLength(tail, 'utf8') > MAX_STDERR_BYTES) tail = tail.slice(1)
  return tail
}

function redact(value: string, redactions: readonly string[]): string {
  return redactions.reduce((result, secret) => {
    if (secret.length === 0) return result
    return result.split(secret).join(REDACTED)
  }, value)
}

function killProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): boolean {
  if (child.pid === undefined) return child.kill(signal)
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, signal)
      return true
    }
  } catch {
    // The process group may already have exited; fall back to the direct child.
  }
  try { return child.kill(signal) } catch { return false }
}

/**
 * Owns the Claude CLI child used by the SDK bridge.
 *
 * The SDK supplies the child environment explicitly. It is copied without
 * merging the host environment, except for the host executable search path when
 * the SDK did not provide one; credentials and provider settings never leak from
 * the parent shell into the Claude process.
 */
export class ClaudeProcess implements SpawnedProcess {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly redactions: readonly string[]
  private readonly abortSignal: AbortSignal
  private readonly abortHandler: () => void
  private stderr = ''
  private terminatedSignal: NodeJS.Signals | null = null
  private closed = false
  private readonly exitPromise: Promise<ClaudeProcessExit>
  private readonly closePromise: Promise<void>
  private readonly terminationPromise: Promise<ClaudeProcessExit>

  private constructor(options: ClaudeProcessOptions) {
    this.redactions = [...options.redactions ?? []].filter(secret => secret.length > 0)
    this.abortSignal = options.signal
    this.abortHandler = () => { this.kill('SIGTERM') }
    const env = { ...options.env }
    if (env['PATH'] === undefined && env['Path'] === undefined) {
      const inheritedPath = process.env['PATH'] ?? process.env['Path']
      if (inheritedPath !== undefined) env[process.platform === 'win32' ? 'Path' : 'PATH'] = inheritedPath
    }
    this.child = spawn(options.command, [...options.args], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.stderr.on('data', chunk => {
      this.stderr = appendTail(this.stderr, redact(String(chunk), this.redactions))
    })
    this.exitPromise = new Promise(resolve => {
      let error: Error | undefined
      let settled = false
      const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
        if (settled) return
        settled = true
        this.terminatedSignal = signal
        resolve({
          code,
          signal,
          stderr: this.stderr,
          ...(error === undefined ? {} : { error: this.redactError(error) }),
        })
      }
      this.child.once('error', value => {
        error = value instanceof Error ? value : new Error(String(value))
        finish(this.child.exitCode ?? null, this.child.signalCode ?? null)
      })
      this.child.once('exit', (code, signal) => finish(code, signal))
    })
    this.closePromise = new Promise(resolve => { this.child.once('close', () => resolve()) })
    this.terminationPromise = Promise.all([this.exitPromise, this.closePromise]).then(([exit]) => exit)
    if (options.signal.aborted) this.abortHandler()
    else options.signal.addEventListener('abort', this.abortHandler, { once: true })
  }

  static start(options: ClaudeProcessOptions): ClaudeProcess {
    return new ClaudeProcess(options)
  }

  get stdin(): ChildProcessWithoutNullStreams['stdin'] { return this.child.stdin }
  get stdout(): ChildProcessWithoutNullStreams['stdout'] { return this.child.stdout }
  get killed(): boolean { return this.child.killed }
  get exitCode(): number | null { return this.child.exitCode ?? null }
  get signalCode(): NodeJS.Signals | null { return this.terminatedSignal }
  get pid(): number | undefined { return this.child.pid }
  get stderrTail(): string { return this.stderr }
  get exited(): Promise<ClaudeProcessExit> { return this.exitPromise }

  kill(signal: NodeJS.Signals): boolean {
    return killProcessTree(this.child, signal)
  }

  on(event: 'exit', listener: ExitListener): this
  on(event: 'error', listener: ErrorListener): this
  on(event: 'exit' | 'error', listener: ExitListener | ErrorListener): this {
    if (event === 'exit') this.child.on('exit', listener as ExitListener)
    else this.child.on('error', listener as ErrorListener)
    return this
  }

  once(event: 'exit', listener: ExitListener): this
  once(event: 'error', listener: ErrorListener): this
  once(event: 'exit' | 'error', listener: ExitListener | ErrorListener): this {
    if (event === 'exit') this.child.once('exit', listener as ExitListener)
    else this.child.once('error', listener as ErrorListener)
    return this
  }

  off(event: 'exit', listener: ExitListener): this
  off(event: 'error', listener: ErrorListener): this
  off(event: 'exit' | 'error', listener: ExitListener | ErrorListener): this {
    if (event === 'exit') this.child.off('exit', listener as ExitListener)
    else this.child.off('error', listener as ErrorListener)
    return this
  }

  async close(graceMs = 2_000): Promise<ClaudeProcessExit> {
    if (this.closed) return this.terminationPromise
    this.closed = true
    this.abortSignal.removeEventListener('abort', this.abortHandler)
    this.stdin.end()
    const graceful = await this.waitForTermination(graceMs)
    if (graceful !== undefined) return graceful
    this.kill('SIGTERM')
    const terminated = await this.waitForTermination(graceMs)
    if (terminated !== undefined) return terminated
    this.kill('SIGKILL')
    return this.terminationPromise
  }

  private async waitForTermination(graceMs: number): Promise<ClaudeProcessExit | undefined> {
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

export function claudeProcessRedactions(options: {
  readonly authToken?: string
  readonly environment?: Readonly<Record<string, string | undefined>>
}): readonly string[] {
  return [
    options.authToken,
    options.environment?.['ANTHROPIC_AUTH_TOKEN'],
    options.environment?.['ANTHROPIC_API_KEY'],
  ].filter((value): value is string => value !== undefined && value.length > 0)
}
