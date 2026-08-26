import {
  getSessionInfo,
  getSessionMessages,
  importSessionToStore,
  listSessions,
  type GetSessionInfoOptions,
  type GetSessionMessagesOptions,
  type ImportSessionToStoreOptions,
  type ListSessionsOptions,
  type SDKSessionInfo,
  type SessionMessage,
  type SessionStore,
} from '@anthropic-ai/claude-agent-sdk'
import type { ClaudePersistenceHandle, ClaudeSdkGateway } from './types.js'

/** Version of the serialized plugin persistence envelope. */
export const CLAUDE_PERSISTENCE_VERSION = 1 as const
export type { ClaudePersistenceHandle, ClaudeSdkGateway } from './types.js'

export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue }
type JsonObject = { readonly [key: string]: JsonValue }
export type ClaudePersistedPersistenceHandle = ClaudePersistenceHandle & { readonly version: typeof CLAUDE_PERSISTENCE_VERSION }

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])
const secretKey = /(secret|token|password|api[-_]?key|credential|authorization)/i
const allowedHandleKeys = new Set(['version', 'provider', 'sessionId', 'nativeHandle', 'cwd', 'runtimeRoot', 'forked', 'metadata'])

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be non-empty`)
  return value.trim()
}

function assertAbsolutePath(value: unknown, name: string): string {
  const path = assertString(value, name)
  if (!path.startsWith('/')) throw new TypeError(`${name} must be absolute`)
  return path
}

function cloneJson(value: unknown, path = 'metadata'): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be JSON-safe`)
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => cloneJson(item, `${path}[${index}]`))
  if (!isRecord(value)) throw new TypeError(`${path} must be JSON-safe`)
  const entries: Array<readonly [string, JsonValue]> = []
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new TypeError(`forbidden key: ${key}`)
    if (secretKey.test(key)) throw new TypeError(`secret field is not allowed: ${key}`)
    const entry: readonly [string, JsonValue] = [key, cloneJson(item, `${path}.${key}`)]
    entries.push(entry)
  }
  return Object.fromEntries(entries)
}

function cloneJsonObject(value: unknown, path: string): JsonObject {
  const cloned = cloneJson(value, path)
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
    throw new TypeError(`${path} must be a JSON object`)
  }
  return cloned
}

function canonicalHandle(input: ClaudePersistenceHandle): ClaudePersistenceHandle {
  if (input.provider !== 'claude-cli') throw new TypeError('provider must be claude-cli')
  const sessionId = assertString(input.sessionId, 'sessionId')
  const nativeHandle = assertString(input.nativeHandle, 'nativeHandle')
  const cwd = assertAbsolutePath(input.cwd, 'cwd')
  return {
    provider: 'claude-cli',
    sessionId,
    nativeHandle,
    cwd,
    ...(input.runtimeRoot === undefined ? {} : { runtimeRoot: assertAbsolutePath(input.runtimeRoot, 'runtimeRoot') }),
    ...(input.forked === undefined ? {} : { forked: typeof input.forked === 'boolean' ? input.forked : (() => { throw new TypeError('forked must be boolean') })() }),
    ...(input.metadata === undefined ? {} : { metadata: cloneJsonObject(input.metadata, 'metadata') }),
  }
}

/** Validates and copies a provider handle before it crosses a persistence boundary. */
export function normalizeClaudePersistenceHandle(input: ClaudePersistenceHandle): ClaudePersistenceHandle {
  return canonicalHandle(input)
}

/** Creates the plain native handle used by ProviderSession and Engine Suite APIs. */
export function createClaudePersistenceHandle(input: Omit<ClaudePersistenceHandle, 'provider'>): ClaudePersistenceHandle {
  return canonicalHandle({ provider: 'claude-cli', ...input })
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') {
    const entries: Array<readonly [string, JsonValue]> = Object.keys(value).sort().map(key => {
      const child = value[key]
      if (child === undefined) throw new TypeError('JSON object contains undefined')
      const entry: readonly [string, JsonValue] = [key, sortJson(child)]
      return entry
    })
    return Object.fromEntries(entries)
  }
  return value
}

/** Serializes a handle as a stable, secret-free versioned JSON envelope. */
export function serializeClaudePersistenceHandle(handle: ClaudePersistenceHandle): string {
  const valid = canonicalHandle(handle)
  const entries: Array<readonly [string, JsonValue]> = [
    ['cwd', valid.cwd],
    ['nativeHandle', valid.nativeHandle],
    ['provider', valid.provider],
    ['sessionId', valid.sessionId],
    ['version', CLAUDE_PERSISTENCE_VERSION],
  ]
  if (valid.forked !== undefined) entries.push(['forked', valid.forked])
  if (valid.metadata !== undefined) entries.push(['metadata', cloneJsonObject(valid.metadata, 'metadata')])
  if (valid.runtimeRoot !== undefined) entries.push(['runtimeRoot', valid.runtimeRoot])
  return JSON.stringify(sortJson(Object.fromEntries(entries)))
}

/** Parses and validates the serialized persistence envelope into a plain native handle. */
export function parseClaudePersistenceHandle(input: string): ClaudePersistenceHandle {
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    throw new TypeError('invalid persistence handle JSON')
  }
  if (!isRecord(parsed)) throw new TypeError('invalid persistence handle')
  const value = parsed
  for (const key of Object.keys(value)) {
    if (forbiddenKeys.has(key) || !allowedHandleKeys.has(key)) throw new TypeError(`unsupported handle field: ${key}`)
  }
  if (value['version'] !== CLAUDE_PERSISTENCE_VERSION) throw new TypeError('invalid Claude persistence handle version')
  if (value['provider'] !== 'claude-cli') throw new TypeError('invalid Claude persistence handle provider')
  const sessionId = assertString(value['sessionId'], 'sessionId')
  const nativeHandle = assertString(value['nativeHandle'], 'nativeHandle')
  const cwd = assertAbsolutePath(value['cwd'], 'cwd')
  const runtimeRoot = value['runtimeRoot'] === undefined ? undefined : assertAbsolutePath(value['runtimeRoot'], 'runtimeRoot')
  if (value['forked'] !== undefined && typeof value['forked'] !== 'boolean') throw new TypeError('forked must be boolean')
  const metadata = value['metadata'] === undefined
    ? undefined
    : cloneJsonObject(value['metadata'], 'metadata')
  return canonicalHandle({
    provider: 'claude-cli',
    sessionId,
    nativeHandle,
    cwd,
    ...(runtimeRoot === undefined ? {} : { runtimeRoot }),
    ...(value['forked'] === undefined ? {} : { forked: value['forked'] }),
    ...(metadata === undefined ? {} : { metadata }),
  })
}

export type ClaudePersistenceCapability =
  | 'session-list'
  | 'session-history'
  | 'session-import'
  | 'session-resume'
  | 'session-reconnect'
  | 'session-archive'

export class ClaudeCapabilityError extends Error {
  readonly code = 'CLAUDE_CAPABILITY_UNAVAILABLE' as const

  constructor(readonly capability: ClaudePersistenceCapability, message: string) {
    super(`Claude capability ${capability} is unavailable: ${message}`)
    this.name = 'ClaudeCapabilityError'
  }
}

export const realClaudeSdkGateway: ClaudeSdkGateway = {
  capability: 'sdk-native',
  listSessions,
  getSessionInfo,
  getSessionMessages,
  importSessionToStore,
}

export interface ClaudeSessionDescriptor extends SDKSessionInfo {
  readonly provider: 'claude-cli'
  readonly nativeSessionId: string
}

export interface ListClaudeSessionsInput {
  readonly cwd?: string
  readonly limit?: number
  readonly offset?: number
}

function pageNumber(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`)
  return value
}

export async function listClaudeSessionDescriptors(
  gateway: Pick<ClaudeSdkGateway, 'listSessions'>,
  input: ListClaudeSessionsInput = {},
): Promise<ClaudeSessionDescriptor[]> {
  const cwd = input.cwd === undefined ? undefined : assertAbsolutePath(input.cwd, 'cwd')
  const limit = pageNumber(input.limit, 'limit')
  const offset = pageNumber(input.offset, 'offset')
  const options: ListSessionsOptions = {
    ...(cwd === undefined ? {} : { dir: cwd }),
    ...(limit === undefined ? {} : { limit }),
    ...(offset === undefined ? {} : { offset }),
  }
  const sessions = await gateway.listSessions(options)
  return [...sessions]
    .sort((a, b) => b.lastModified - a.lastModified || a.sessionId.localeCompare(b.sessionId))
    .map(session => ({ ...session, provider: 'claude-cli' as const, nativeSessionId: session.sessionId }))
}

export function normalizeClaudeSessionDescriptor(session: SDKSessionInfo): ClaudeSessionDescriptor {
  return { ...session, provider: 'claude-cli', nativeSessionId: session.sessionId }
}

export interface ClaudeSessionHistoryOptions {
  readonly limit?: number
  readonly offset?: number
  readonly includeSystemMessages?: boolean
  readonly sessionStore?: SessionStore
}

export async function getClaudeSessionHistory(
  gateway: Pick<ClaudeSdkGateway, 'getSessionMessages'>,
  handle: ClaudePersistenceHandle,
  input: ClaudeSessionHistoryOptions = {},
): Promise<SessionMessage[]> {
  const valid = canonicalHandle(handle)
  const limit = pageNumber(input.limit, 'limit')
  const offset = pageNumber(input.offset, 'offset')
  const options: GetSessionMessagesOptions = {
    dir: valid.cwd,
    ...(limit === undefined ? {} : { limit }),
    ...(offset === undefined ? {} : { offset }),
    ...(input.includeSystemMessages === undefined ? {} : { includeSystemMessages: input.includeSystemMessages }),
    ...(input.sessionStore === undefined ? {} : { sessionStore: input.sessionStore }),
  }
  return gateway.getSessionMessages(valid.nativeHandle, options)
}

export interface ClaudeImportSessionInput {
  readonly handle: ClaudePersistenceHandle
  readonly store?: SessionStore
  readonly includeSubagents?: boolean
  readonly batchSize?: number
}

export interface ClaudeImportedSession {
  readonly handle: ClaudePersistenceHandle
  readonly descriptor?: ClaudeSessionDescriptor
  readonly history: readonly SessionMessage[]
}

export async function importClaudeSessionToStore(
  gateway: ClaudeSdkGateway,
  input: ClaudeImportSessionInput,
): Promise<ClaudeImportedSession> {
  const handle = canonicalHandle(input.handle)
  if (input.store === undefined) {
    throw new ClaudeCapabilityError('session-import', 'an SDK SessionStore is required to materialize an imported transcript')
  }
  const batchSize = input.batchSize
  if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize <= 0)) throw new RangeError('batchSize must be a positive integer')
  const importOptions: ImportSessionToStoreOptions = {
    dir: handle.cwd,
    ...(input.includeSubagents === undefined ? {} : { includeSubagents: input.includeSubagents }),
    ...(batchSize === undefined ? {} : { batchSize }),
  }
  await gateway.importSessionToStore(handle.nativeHandle, input.store, importOptions)
  const descriptor = await gateway.getSessionInfo(handle.nativeHandle, { dir: handle.cwd, sessionStore: input.store })
  const history = await gateway.getSessionMessages(handle.nativeHandle, { dir: handle.cwd, sessionStore: input.store })
  return {
    handle,
    ...(descriptor === undefined ? {} : { descriptor: normalizeClaudeSessionDescriptor(descriptor) }),
    history,
  }
}

export class ClaudeArchiveNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Claude session is not known to the archive store: ${sessionId}`)
    this.name = 'ClaudeArchiveNotFoundError'
  }
}

export interface ClaudeArchiveState {
  readonly handle: ClaudePersistenceHandle
  readonly archivedAt: string
}

export interface ClaudeArchiveStore {
  remember(handle: ClaudePersistenceHandle): void
  archive(handle: ClaudePersistenceHandle, at?: string): ClaudeArchiveState
  unarchive(handle: ClaudePersistenceHandle): boolean
  get(handle: ClaudePersistenceHandle): ClaudeArchiveState | undefined
  list(): ClaudeArchiveState[]
  serialize(): string
}

/** Plugin-owned archive metadata. Claude SDK has no archive operation, so this store never calls one. */
export function createClaudeArchiveStore(initialHandles: readonly ClaudePersistenceHandle[] = []): ClaudeArchiveStore {
  const known = new Map<string, ClaudePersistenceHandle>()
  const archived = new Map<string, ClaudeArchiveState>()
  for (const handle of initialHandles) {
    const valid = canonicalHandle(handle)
    known.set(valid.sessionId, valid)
  }
  const keyFor = (handle: ClaudePersistenceHandle): string => canonicalHandle(handle).sessionId
  return {
    remember: handle => {
      const valid = canonicalHandle(handle)
      known.set(valid.sessionId, valid)
    },
    archive: (handle, at = new Date().toISOString()) => {
      const valid = canonicalHandle(handle)
      if (!known.has(valid.sessionId)) throw new ClaudeArchiveNotFoundError(valid.sessionId)
      const current = archived.get(valid.sessionId)
      if (current !== undefined) return { handle: { ...current.handle }, archivedAt: current.archivedAt }
      const state: ClaudeArchiveState = { handle: { ...valid }, archivedAt: at }
      archived.set(valid.sessionId, state)
      return { handle: { ...state.handle }, archivedAt: state.archivedAt }
    },
    unarchive: handle => archived.delete(keyFor(handle)),
    get: handle => {
      const state = archived.get(keyFor(handle))
      return state === undefined ? undefined : { handle: { ...state.handle }, archivedAt: state.archivedAt }
    },
    list: () => [...archived.values()].map(state => ({ handle: { ...state.handle }, archivedAt: state.archivedAt })),
    serialize: () => JSON.stringify([...archived.values()]
      .sort((a, b) => a.handle.sessionId.localeCompare(b.handle.sessionId))
      .map(state => ({ handle: state.handle, archivedAt: state.archivedAt }))),
  }
}
