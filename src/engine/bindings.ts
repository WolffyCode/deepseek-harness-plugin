import { mkdir, open, readFile, rename, unlink, writeFile, type FileHandle } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, dirname, join, resolve } from 'node:path'
import type { EngineSelection } from '../profile/types.js'

/** Current durable on-disk schema version for Engine Suite session bindings. */
export const EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION = 2

type UnknownRecord = Record<string, unknown>

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
  readonly version: typeof EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION
  readonly bindings: readonly ExternalEngineBinding[]
}

const fileLocks = new Map<string, Promise<void>>()
const currentBindingKeys = ['sessionId', 'engineId', 'nativeSessionId', 'runtimeRoot', 'selection', 'executable', 'args'] as const
const legacyBindingKeys = [...currentBindingKeys, 'threadId'] as const
const selectionKeys = ['engineId', 'providerId', 'modelRecordId', 'reasoningEffort'] as const
const credentialArgumentPattern = /(?:^|[-_=:])(api[-_]?key|access[-_]?token|auth(?:entication)?[-_]?token|credential|password|secret|authorization)(?:$|[-_=:])/iu

function nextLockTurn(): Promise<void> {
  return new Promise(resolveCurrent => setImmediate(resolveCurrent))
}

/** Acquire an OS-visible lock after the process-local queue has serialized callers in this process. */
async function acquireFileLock(file: string): Promise<() => Promise<void>> {
  const lockFile = `${file}.lock`
  await mkdir(dirname(file), { recursive: true })
  while (true) {
    let handle: FileHandle | undefined
    try {
      handle = await open(lockFile, 'wx', 0o600)
      await handle.writeFile(`${process.pid}\n`, 'utf8')
      return async () => {
        await handle!.close()
        await unlink(lockFile).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        })
      }
    } catch (error: unknown) {
      await handle?.close().catch(() => undefined)
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      try {
        const owner = Number((await readFile(lockFile, 'utf8')).trim())
        if (Number.isSafeInteger(owner) && owner > 0) process.kill(owner, 0)
      } catch (ownerError: unknown) {
        if ((ownerError as NodeJS.ErrnoException).code === 'ESRCH') {
          await unlink(lockFile).catch((unlinkError: unknown) => {
            if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError
          })
          continue
        }
      }
      await nextLockTurn()
    }
  }
}

/** Serializes binding read-modify-write transactions across store instances and processes. */
async function withFileLock<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(file)
  let releaseProcess!: () => void
  const current = new Promise<void>(resolveCurrent => { releaseProcess = resolveCurrent })
  fileLocks.set(file, current)
  await previous?.catch(() => undefined)
  let releaseFile: (() => Promise<void>) | undefined
  try {
    releaseFile = await acquireFileLock(file)
    return await operation()
  } finally {
    try {
      await releaseFile?.()
    } finally {
      releaseProcess()
      if (fileLocks.get(file) === current) fileLocks.delete(file)
    }
  }
}

function homeRoot(): string {
  return process.env['DSH_ENGINE_SUITE_HOME']
    ?? join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'engine-suite')
}

function object(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as UnknownRecord
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

function exactKeys(value: UnknownRecord, allowed: readonly string[], label: string): void {
  const accepted = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) throw new Error(`${label} must not declare ${key}`)
  }
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  return text(value, label)
}

function optionalArgs(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  const args = value.map((argument, index) => text(argument, `${label}[${index}]`))
  for (const [index, argument] of args.entries()) {
    if (credentialArgumentPattern.test(argument)) {
      throw new Error(`${label}[${index}] must not carry credentials`)
    }
  }
  return args
}

function normalizeSelection(value: unknown, label: string): EngineSelection {
  const selection = object(value, label)
  exactKeys(selection, selectionKeys, label)
  const reasoningEffort = optionalText(selection['reasoningEffort'], `${label}.reasoningEffort`)
  return {
    engineId: text(selection['engineId'], `${label}.engineId`),
    providerId: text(selection['providerId'], `${label}.providerId`),
    modelRecordId: text(selection['modelRecordId'], `${label}.modelRecordId`),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

function normalizeBinding(value: unknown, legacy: boolean): ExternalEngineBinding {
  const candidate = object(value, 'binding')
  exactKeys(candidate, legacy ? legacyBindingKeys : currentBindingKeys, 'binding')
  const sessionId = text(candidate['sessionId'], 'binding.sessionId')
  const engineId = text(candidate['engineId'] ?? (legacy ? 'codex-cli' : undefined), 'binding.engineId')
  const nativeSessionId = text(
    candidate['nativeSessionId'] ?? (legacy ? candidate['threadId'] : undefined),
    'binding.nativeSessionId',
  )
  const runtimeRoot = text(candidate['runtimeRoot'], 'binding.runtimeRoot')
  if (!isAbsolute(runtimeRoot)) throw new Error('binding.runtimeRoot must be an absolute path')
  const selection = normalizeSelection(candidate['selection'], 'binding.selection')
  if (selection.engineId !== engineId) {
    throw new Error(`binding engine does not match selection: ${engineId} !== ${selection.engineId}`)
  }
  const executable = optionalText(candidate['executable'], 'binding.executable')
  const args = optionalArgs(candidate['args'], 'binding.args')
  return {
    sessionId,
    engineId,
    nativeSessionId,
    runtimeRoot,
    selection,
    ...(executable === undefined ? {} : { executable }),
    ...(args === undefined ? {} : { args: [...args] }),
  }
}

function normalizeDocument(value: unknown): ExternalEngineBindingDocument {
  const document = object(value, 'binding document')
  exactKeys(document, ['version', 'bindings'], 'binding document')
  if (!Array.isArray(document['bindings'])) throw new Error('binding document.bindings must be an array')
  if (document['version'] === 1) {
    return {
      version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION,
      bindings: document['bindings'].map(binding => normalizeBinding(binding, true)),
    }
  }
  if (document['version'] !== EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION) {
    throw new Error(`unsupported binding document version: ${String(document['version'])}`)
  }
  return {
    version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION,
    bindings: document['bindings'].map(binding => normalizeBinding(binding, false)),
  }
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
    return withFileLock(this.file, async () => {
      const document = await this.read()
      return document.bindings.find(binding => binding.sessionId === sessionId)
    })
  }

  async put(binding: ExternalEngineBinding): Promise<void> {
    const normalized = normalizeBinding(binding, false)
    await withFileLock(this.file, async () => {
      const document = await this.read()
      const bindings = document.bindings.filter(candidate => candidate.sessionId !== normalized.sessionId)
      bindings.push(normalized)
      await this.write({ version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION, bindings })
    })
  }

  async remove(sessionId: string): Promise<void> {
    await withFileLock(this.file, async () => {
      const document = await this.read()
      const bindings = document.bindings.filter(binding => binding.sessionId !== sessionId)
      if (bindings.length === document.bindings.length) return
      await this.write({ version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION, bindings })
    })
  }

  private async read(): Promise<ExternalEngineBindingDocument> {
    try {
      return normalizeDocument(JSON.parse(await readFile(this.file, 'utf8')) as unknown)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION, bindings: [] }
      }
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
