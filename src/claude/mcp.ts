import type {
  McpHttpServerConfig,
  McpSSEServerConfig,
  McpServerConfig,
  McpStdioServerConfig,
  Options as ClaudeSdkOptions,
} from '@anthropic-ai/claude-agent-sdk'

/** Canonical transports accepted by the Claude asset materializer. */
export type CanonicalMcpTransport = 'stdio' | 'http' | 'sse'

/** Asset ownership is explicit so Harness-owned connections cannot enter user config. */
export type ClaudeAssetScope = 'user' | 'internal' | 'harness'

export interface CanonicalMcpServerBase {
  readonly name: string
  readonly transport: CanonicalMcpTransport
  readonly scope?: ClaudeAssetScope
  readonly alwaysLoad?: boolean
  /** Map of target env/header names to runtime-only credential references. */
  readonly credentialRefs?: Readonly<Record<string, string>>
}

export type CanonicalStdioMcpServer = CanonicalMcpServerBase & {
  readonly transport: 'stdio'
  readonly command: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly url?: never
  readonly headers?: never
}

export type CanonicalHttpMcpServer = CanonicalMcpServerBase & {
  readonly transport: 'http'
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly command?: never
  readonly args?: never
  readonly env?: never
}

export type CanonicalSseMcpServer = CanonicalMcpServerBase & {
  readonly transport: 'sse'
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly command?: never
  readonly args?: never
  readonly env?: never
}

export type CanonicalMcpServer =
  | CanonicalStdioMcpServer
  | CanonicalHttpMcpServer
  | CanonicalSseMcpServer

export interface CanonicalMcpSet {
  readonly scope?: ClaudeAssetScope
  readonly servers: readonly CanonicalMcpServer[]
}

export interface ClaudeCredentialResolver {
  resolve(reference: string): string | undefined
}

export interface ClaudeMcpSdkSupport {
  readonly stdio: boolean
  readonly http: boolean
  readonly sse: boolean
}

/**
 * Evidence-backed capability declaration for SDK 0.3.246: all three process
 * transports are present in the installed SDK declarations.
 */
export const CLAUDE_MCP_SDK_SUPPORT: ClaudeMcpSdkSupport = Object.freeze({
  stdio: true,
  http: true,
  sse: true,
})

export interface ClaudeMcpMaterializeOptions {
  readonly credentialResolver?: ClaudeCredentialResolver
  readonly sdkSupport?: Partial<ClaudeMcpSdkSupport>
}

export type ClaudeSdkMcpServerConfig =
  | McpStdioServerConfig
  | McpHttpServerConfig
  | McpSSEServerConfig

export type ClaudeMcpOptionsFragment = Readonly<Pick<ClaudeSdkOptions, 'mcpServers'>>

export type ClaudeAssetErrorCode =
  | 'CLAUDE_ASSET_SCOPE_FORBIDDEN'
  | 'MCP_INVALID_CONFIG'
  | 'MCP_INVALID_NAME'
  | 'MCP_INVALID_TRANSPORT'
  | 'MCP_INVALID_URL'
  | 'MCP_INVALID_FIELD'
  | 'MCP_CONFLICTING_FIELDS'
  | 'MCP_DUPLICATE_NAME'
  | 'MCP_CREDENTIAL_RESOLVER_MISSING'
  | 'MCP_CREDENTIAL_MISSING'
  | 'MCP_CREDENTIAL_RESOLUTION_FAILED'
  | 'MCP_SDK_UNSUPPORTED_TRANSPORT'

export class ClaudeAssetMaterializationError extends Error {
  readonly code: ClaudeAssetErrorCode
  readonly path: string

  constructor(code: ClaudeAssetErrorCode, path: string, detail: string) {
    super(`${code} at ${path}: ${detail}`)
    this.name = 'ClaudeAssetMaterializationError'
    this.code = code
    this.path = path
  }
}

function fail(code: ClaudeAssetErrorCode, path: string, detail: string): never {
  throw new ClaudeAssetMaterializationError(code, path, detail)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function nonEmptyString(value: unknown, path: string, code: ClaudeAssetErrorCode = 'MCP_INVALID_FIELD'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(code, path, 'must be a non-empty string')
  }
  return value.trim()
}

function readStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) fail('MCP_INVALID_FIELD', path, 'must be an array of strings')
  return value.map((entry, index) => nonEmptyString(entry, `${path}[${index}]`))
}

function isSecretLikeName(value: string): boolean {
  return /(?:authorization|api[-_]?key|token|secret|password|credential)/iu.test(value)
}

function readStringMap(value: unknown, path: string, rejectSecrets: boolean): Readonly<Record<string, string>> {
  if (!isRecord(value)) fail('MCP_INVALID_FIELD', path, 'must be an object of string values')
  const result: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    const keyPath = `${path}.${key}`
    const normalizedKey = nonEmptyString(key, keyPath)
    if (rejectSecrets && isSecretLikeName(normalizedKey)) {
      fail('MCP_INVALID_FIELD', keyPath, 'secret-like values must use credentialRefs')
    }
    result[normalizedKey] = nonEmptyString(rawValue, keyPath)
  }
  return result
}

function readCredentialRefs(value: unknown, path: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) fail('MCP_INVALID_FIELD', path, 'must be an object of reference names')
  const result: Record<string, string> = {}
  for (const [key, rawReference] of Object.entries(value)) {
    const keyPath = `${path}.${key}`
    result[nonEmptyString(key, keyPath)] = nonEmptyString(rawReference, keyPath)
  }
  return result
}

function validateScope(value: unknown, path: string): ClaudeAssetScope | undefined {
  if (value === undefined) return undefined
  if (value !== 'user' && value !== 'internal' && value !== 'harness') {
    fail('MCP_INVALID_FIELD', path, 'scope must be user, internal, or harness')
  }
  if (value !== 'user') fail('CLAUDE_ASSET_SCOPE_FORBIDDEN', path, 'only user assets may be materialized')
  return value
}

function validateUrl(value: unknown, path: string): string {
  const url = nonEmptyString(value, path)
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      fail('MCP_INVALID_URL', path, 'must use http or https')
    }
  } catch (error) {
    if (error instanceof ClaudeAssetMaterializationError) throw error
    fail('MCP_INVALID_URL', path, 'must be a valid http or https URL')
  }
  return url
}

type ValidatedStdioMcpServer = {
  readonly name: string
  readonly transport: 'stdio'
  readonly command: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly credentialRefs?: Readonly<Record<string, string>>
  readonly alwaysLoad?: boolean
}

type ValidatedRemoteMcpServer = {
  readonly name: string
  readonly transport: 'http' | 'sse'
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly credentialRefs?: Readonly<Record<string, string>>
  readonly alwaysLoad?: boolean
}

type ValidatedMcpServer = ValidatedStdioMcpServer | ValidatedRemoteMcpServer

function validateServer(value: unknown, index: number, inheritedScope: unknown): ValidatedMcpServer {
  const arrayPath = `mcpServers[${index}]`
  if (!isRecord(value)) fail('MCP_INVALID_CONFIG', arrayPath, 'must be an object')
  const name = nonEmptyString(value['name'], `${arrayPath}.name`, 'MCP_INVALID_NAME')
  const path = `mcpServers.${name}`
  const scope = value['scope'] ?? inheritedScope
  validateScope(scope, `${path}.scope`)
  const alwaysLoad = value['alwaysLoad']
  if (alwaysLoad !== undefined && typeof alwaysLoad !== 'boolean') {
    fail('MCP_INVALID_FIELD', `${path}.alwaysLoad`, 'must be a boolean')
  }
  const rawTransport = value['transport']
  if (rawTransport !== 'stdio' && rawTransport !== 'http' && rawTransport !== 'sse') {
    fail('MCP_INVALID_TRANSPORT', `${path}.transport`, 'must be stdio, http, or sse')
  }
  const transport = rawTransport
  const credentialRefs = value['credentialRefs'] === undefined
    ? undefined
    : readCredentialRefs(value['credentialRefs'], `${path}.credentialRefs`)

  if (transport === 'stdio') {
    if (hasOwn(value, 'url')) fail('MCP_CONFLICTING_FIELDS', `${path}.url`, 'stdio does not accept url')
    if (hasOwn(value, 'headers')) fail('MCP_CONFLICTING_FIELDS', `${path}.headers`, 'stdio does not accept headers')
    const command = nonEmptyString(value['command'], `${path}.command`)
    const args = value['args'] === undefined ? undefined : readStringArray(value['args'], `${path}.args`)
    const env = value['env'] === undefined ? undefined : readStringMap(value['env'], `${path}.env`, true)
    return {
      name,
      transport,
      command,
      ...(args === undefined ? {} : { args }),
      ...(env === undefined ? {} : { env }),
      ...(credentialRefs === undefined ? {} : { credentialRefs }),
      ...(alwaysLoad === undefined ? {} : { alwaysLoad }),
    }
  }

  if (hasOwn(value, 'command')) fail('MCP_CONFLICTING_FIELDS', `${path}.command`, `${transport} does not accept command`)
  if (hasOwn(value, 'args')) fail('MCP_CONFLICTING_FIELDS', `${path}.args`, `${transport} does not accept args`)
  if (hasOwn(value, 'env')) fail('MCP_CONFLICTING_FIELDS', `${path}.env`, `${transport} does not accept env`)
  const url = validateUrl(value['url'], `${path}.url`)
  const headers = value['headers'] === undefined ? undefined : readStringMap(value['headers'], `${path}.headers`, true)
  return {
    name,
    transport,
    url,
    ...(headers === undefined ? {} : { headers }),
    ...(credentialRefs === undefined ? {} : { credentialRefs }),
    ...(alwaysLoad === undefined ? {} : { alwaysLoad }),
  }
}

function readSet(value: unknown): { readonly servers: readonly unknown[]; readonly scope: unknown } {
  if (Array.isArray(value)) return { servers: value, scope: undefined }
  if (!isRecord(value)) fail('MCP_INVALID_CONFIG', 'mcpServers', 'must be a server array or set object')
  const servers = value['servers']
  if (!Array.isArray(servers)) fail('MCP_INVALID_CONFIG', 'mcpServers.servers', 'must be an array')
  return { servers, scope: value['scope'] }
}

function validateSet(value: unknown): readonly ValidatedMcpServer[] {
  const { servers, scope } = readSet(value)
  validateScope(scope, 'mcpServers.scope')
  const result: ValidatedMcpServer[] = []
  const names = new Set<string>()
  for (const [index, server] of servers.entries()) {
    const validated = validateServer(server, index, scope)
    if (names.has(validated.name)) fail('MCP_DUPLICATE_NAME', `mcpServers.${validated.name}.name`, 'server names must be unique')
    names.add(validated.name)
    result.push(validated)
  }
  return result
}

function sdkSupport(options: ClaudeMcpMaterializeOptions): ClaudeMcpSdkSupport {
  return {
    stdio: options.sdkSupport?.stdio ?? CLAUDE_MCP_SDK_SUPPORT.stdio,
    http: options.sdkSupport?.http ?? CLAUDE_MCP_SDK_SUPPORT.http,
    sse: options.sdkSupport?.sse ?? CLAUDE_MCP_SDK_SUPPORT.sse,
  }
}

function resolveCredentials(
  refs: Readonly<Record<string, string>> | undefined,
  resolver: ClaudeCredentialResolver | undefined,
  path: string,
): Readonly<Record<string, string>> | undefined {
  if (refs === undefined) return undefined
  const entries = Object.entries(refs)
  if (entries.length === 0) return {}
  if (resolver === undefined) {
    const firstTarget = entries[0]?.[0]
    fail('MCP_CREDENTIAL_RESOLVER_MISSING', firstTarget === undefined ? path : `${path}.${firstTarget}`, 'credentialResolver is required')
  }
  const result: Record<string, string> = {}
  for (const [target, reference] of entries) {
    let resolved: string | undefined
    try {
      resolved = resolver.resolve(reference)
    } catch {
      fail('MCP_CREDENTIAL_RESOLUTION_FAILED', `${path}.${target}`, 'credential resolution failed')
    }
    if (typeof resolved !== 'string' || resolved.length === 0) {
      fail('MCP_CREDENTIAL_MISSING', `${path}.${target}`, 'credential reference did not resolve')
    }
    result[target] = resolved
  }
  return result
}

function checkTransportSupport(transport: CanonicalMcpTransport, support: ClaudeMcpSdkSupport, path: string): void {
  if (!support[transport]) {
    fail('MCP_SDK_UNSUPPORTED_TRANSPORT', path, `Claude SDK does not support ${transport}`)
  }
}

function materializeServer(
  server: ValidatedMcpServer,
  options: ClaudeMcpMaterializeOptions,
): ClaudeSdkMcpServerConfig {
  const path = `mcpServers.${server.name}`
  checkTransportSupport(server.transport, sdkSupport(options), `${path}.transport`)
  const resolved = resolveCredentials(server.credentialRefs, options.credentialResolver, `${path}.credentialRefs`)
  const alwaysLoad = server.alwaysLoad
  if (server.transport === 'stdio') {
    const env = server.env === undefined && resolved === undefined
      ? undefined
      : { ...server.env, ...resolved }
    return {
      type: 'stdio',
      command: server.command,
      ...(server.args === undefined ? {} : { args: [...server.args] }),
      ...(env === undefined ? {} : { env }),
      ...(alwaysLoad === undefined ? {} : { alwaysLoad }),
    }
  }
  const headers = server.headers === undefined && resolved === undefined
    ? undefined
    : { ...server.headers, ...resolved }
  return {
    type: server.transport,
    url: server.url,
    ...(headers === undefined ? {} : { headers }),
    ...(alwaysLoad === undefined ? {} : { alwaysLoad }),
  }
}

/**
 * Materializes user-owned canonical MCP assets into transient Claude SDK
 * process-transport configs. Resolved credential values exist only in this
 * runtime object; canonical inputs never contain them and are never mutated.
 */
export function materializeClaudeMcp(
  input: unknown,
  options: ClaudeMcpMaterializeOptions = {},
): Readonly<Record<string, ClaudeSdkMcpServerConfig>> {
  const servers = validateSet(input)
  const result: Record<string, ClaudeSdkMcpServerConfig> = {}
  servers.forEach(server => {
    result[server.name] = materializeServer(server, options)
  })
  return result
}

/** Returns the only SDK options fragment allowed to cross the Claude boundary for MCP assets. */
export function materializeClaudeMcpOptions(
  input: unknown,
  options: ClaudeMcpMaterializeOptions = {},
): ClaudeMcpOptionsFragment {
  return { mcpServers: materializeClaudeMcp(input, options) }
}
