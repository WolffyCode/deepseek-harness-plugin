import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
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

/** Owns one Codex app-server process and its complete teardown. */
export class CodexProcess {
  readonly child: ChildProcessWithoutNullStreams
  private stderr = ''
  private disposed = false
  private readonly exitPromise: Promise<ProcessExit>

  private constructor(
    child: ChildProcessWithoutNullStreams,
    private readonly options: Required<Pick<CodexProcessOptions, 'disposeGraceMs' | 'redactions'>>,
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
  }

  static start(options: CodexProcessOptions): CodexProcess {
    const executable = options.executable ?? 'codex'
    const args = [...options.args ?? ['app-server', '--listen', 'stdio://']]
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return new CodexProcess(child, {
      disposeGraceMs: options.disposeGraceMs ?? 3_000,
      redactions: options.redactions ?? [],
    })
  }

  get stderrTail(): string {
    return this.stderr
  }

  get exited(): Promise<ProcessExit> {
    return this.exitPromise
  }

  async dispose(): Promise<ProcessExit> {
    if (this.disposed) return this.exitPromise
    this.disposed = true
    this.child.stdin.end()
    const first = await Promise.race([
      this.exitPromise.then(value => ({ done: true as const, value })),
      new Promise<{ done: false }>(resolve => setTimeout(() => resolve({ done: false }), this.options.disposeGraceMs)),
    ])
    if (first.done) return first.value
    killProcessTree(this.child, 'SIGTERM')
    const second = await Promise.race([
      this.exitPromise.then(value => ({ done: true as const, value })),
      new Promise<{ done: false }>(resolve => setTimeout(() => resolve({ done: false }), this.options.disposeGraceMs)),
    ])
    if (second.done) return second.value
    killProcessTree(this.child, 'SIGKILL')
    return this.exitPromise
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
