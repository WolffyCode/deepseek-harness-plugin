import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { EngineSelection } from '../profile/types.js'

export interface ExternalEngineBinding {
  readonly sessionId: string
  readonly engineId: string
  readonly nativeSessionId: string
  readonly runtimeRoot: string
  readonly selection: EngineSelection
  /** Host-owned executable configuration; credentials must never be supplied here. */
  readonly executable?: string
  readonly args?: readonly string[]
}

interface ExternalEngineBindingDocument {
  readonly version: 1
  readonly bindings: readonly ExternalEngineBinding[]
}

const fileLocks = new Map<string, Promise<void>>()

/** Serializes binding read-modify-write transactions across store instances in this process. */
async function withFileLock<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(file)
  let release!: () => void
  const current = new Promise<void>(resolveCurrent => { release = resolveCurrent })
  fileLocks.set(file, current)
  await previous?.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (fileLocks.get(file) === current) fileLocks.delete(file)
  }
}

function homeRoot(): string {
  return process.env['DSH_ENGINE_SUITE_HOME']
    ?? join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'engine-suite')
}

/** Durable, secret-free mapping from Harness Session to a native Engine Session and runtime root. */
export class ExternalEngineBindingStore {
  private readonly file: string

  constructor(file = join(homeRoot(), 'engine-bindings.json')) {
    this.file = resolve(file)
  }

  runtimeRoot(sessionId: string): string {
    return join(dirname(this.file), 'engine-runtime', encodeURIComponent(sessionId))
  }

  async get(sessionId: string): Promise<ExternalEngineBinding | undefined> {
    const document = await this.read()
    return document.bindings.find(binding => binding.sessionId === sessionId)
  }

  async put(binding: ExternalEngineBinding): Promise<void> {
    const normalized: ExternalEngineBinding = {
      sessionId: binding.sessionId,
      engineId: binding.engineId,
      nativeSessionId: binding.nativeSessionId,
      runtimeRoot: binding.runtimeRoot,
      selection: binding.selection,
      ...binding.executable === undefined ? {} : { executable: binding.executable },
      ...binding.args === undefined ? {} : { args: [...binding.args] },
    }
    await withFileLock(this.file, async () => {
      const document = await this.read()
      const bindings = document.bindings.filter(candidate => candidate.sessionId !== normalized.sessionId)
      bindings.push(normalized)
      await this.write({ version: 1, bindings })
    })
  }

  private async read(): Promise<ExternalEngineBindingDocument> {
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8')) as Partial<ExternalEngineBindingDocument>
      if (value.version !== 1 || !Array.isArray(value.bindings)) return { version: 1, bindings: [] }
      return {
        version: 1,
        bindings: value.bindings.filter(binding => binding !== null && typeof binding === 'object').map(binding => {
          const candidate = binding as ExternalEngineBinding & { threadId?: string }
          const executable = typeof candidate.executable === 'string' && candidate.executable.trim() !== ''
            ? candidate.executable
            : undefined
          const args = Array.isArray(candidate.args) && candidate.args.every((argument): argument is string => typeof argument === 'string')
            ? [...candidate.args]
            : undefined
          return {
            sessionId: candidate.sessionId,
            engineId: candidate.engineId ?? 'codex-cli',
            nativeSessionId: candidate.nativeSessionId ?? candidate.threadId ?? '',
            runtimeRoot: candidate.runtimeRoot,
            selection: candidate.selection,
            ...executable === undefined ? {} : { executable },
            ...args === undefined ? {} : { args },
          }
        }).filter(binding => binding.nativeSessionId !== ''),
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, bindings: [] }
      throw error
    }
  }

  private async write(document: ExternalEngineBindingDocument): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.file)
  }
}
