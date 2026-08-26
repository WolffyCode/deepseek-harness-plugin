export type EngineMcpTransport = 'stdio' | 'http' | 'sse'

export interface EngineSkillSet {
  readonly id: string
  /** Claude plugin directories supplied explicitly by the profile. */
  readonly pluginDirs: string[]
  /** Additional trusted directories supplied explicitly by the profile. */
  readonly additionalDirectories: string[]
}

interface EngineMcpServerBase {
  readonly id: string
  readonly name: string
  /** Map of target env/header names to runtime-only credential references. */
  readonly credentialRefs?: Readonly<Record<string, string>>
}

export interface EngineStdioMcpServer extends EngineMcpServerBase {
  readonly transport: 'stdio'
  readonly command?: string
  readonly args?: string[]
  /** Static, non-secret values only. Secret values belong behind credentialRefs. */
  readonly environment?: Readonly<Record<string, string>>
  readonly url?: never
  readonly headers?: never
}

export interface EngineHttpMcpServer extends EngineMcpServerBase {
  readonly transport: 'http'
  /** Required by validation; optional here so callers can perform runtime narrowing before normalization. */
  readonly url?: string
  /** Static, non-secret values only. Secret values belong behind credentialRefs. */
  readonly headers?: Readonly<Record<string, string>>
  readonly command?: never
  readonly args?: never
  readonly environment?: never
}

export interface EngineSseMcpServer extends EngineMcpServerBase {
  readonly transport: 'sse'
  /** Required by validation; optional here so callers can perform runtime narrowing before normalization. */
  readonly url?: string
  /** Static, non-secret values only. Secret values belong behind credentialRefs. */
  readonly headers?: Readonly<Record<string, string>>
  readonly command?: never
  readonly args?: never
  readonly environment?: never
}

export type EngineMcpServer =
  | EngineStdioMcpServer
  | EngineHttpMcpServer
  | EngineSseMcpServer

export interface EngineMcpSet {
  readonly id: string
  readonly servers: EngineMcpServer[]
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${label} must not be empty`)
  return normalized
}

function safeStaticEnvironment(environment: Readonly<Record<string, string>>, serverId: string): Readonly<Record<string, string>> {
  for (const [key, value] of Object.entries(environment)) {
    if (/(key|token|secret|password|credential)/iu.test(key)) {
      throw new Error(`MCP server ${serverId} cannot store a secret-like static environment key: ${key}`)
    }
    nonEmpty(key, 'MCP environment key')
    if (typeof value !== 'string') throw new Error(`MCP server ${serverId} environment values must be strings`)
  }
  return { ...environment }
}

function safeStaticHeaders(headers: Readonly<Record<string, string>>, serverId: string): Readonly<Record<string, string>> {
  for (const [key, value] of Object.entries(headers)) {
    if (/(authorization|api[-_]?key|token|secret|password|credential)/iu.test(key)) {
      throw new Error(`MCP server ${serverId} cannot store a secret-like static header: ${key}`)
    }
    nonEmpty(key, 'MCP header key')
    if (typeof value !== 'string') throw new Error(`MCP server ${serverId} header values must be strings`)
  }
  return { ...headers }
}

function copyCredentialRefs(credentialRefs: Readonly<Record<string, string>>, serverId: string): Readonly<Record<string, string>> {
  const copy: Record<string, string> = {}
  for (const [target, reference] of Object.entries(credentialRefs)) {
    nonEmpty(target, 'MCP credential target')
    if (typeof reference !== 'string') throw new Error(`MCP server ${serverId} credential references must be strings`)
    copy[target] = nonEmpty(reference, 'MCP credential reference')
  }
  return copy
}

/** Rejects transport-exclusive fields even when present with an explicit undefined. */
function rejectForbiddenFields(input: EngineMcpServer, fields: readonly string[]): void {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new Error(`${input.transport} MCP server ${input.id} must not declare ${field}`)
    }
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return nonEmpty(value, label)
}

function normalizeServer(input: EngineMcpServer): EngineMcpServer {
  const id = requiredString(input.id, 'MCP server id')
  const name = requiredString(input.name, 'MCP server name')
  const credentialRefs = input.credentialRefs === undefined ? undefined : copyCredentialRefs(input.credentialRefs, id)
  switch (input.transport) {
    case 'stdio': {
      rejectForbiddenFields(input, ['url', 'headers'])
      const args = input.args === undefined ? undefined : [...input.args]
      const environment = input.environment === undefined ? undefined : safeStaticEnvironment(input.environment, id)
      return {
        id,
        name,
        transport: 'stdio',
        command: requiredString(input.command, 'MCP command'),
        ...(args === undefined ? {} : { args }),
        ...(environment === undefined ? {} : { environment }),
        ...(credentialRefs === undefined ? {} : { credentialRefs }),
      }
    }
    case 'http':
    case 'sse': {
      rejectForbiddenFields(input, ['command', 'args', 'environment'])
      const headers = input.headers === undefined ? undefined : safeStaticHeaders(input.headers, id)
      const url = requiredString(input.url, 'MCP URL')
      return {
        id,
        name,
        transport: input.transport,
        url,
        ...(headers === undefined ? {} : { headers }),
        ...(credentialRefs === undefined ? {} : { credentialRefs }),
      }
    }
  }
}

/** Process-local, secret-free registry for profile-referenced Skill and MCP sets. */
export class EngineAssetRegistry {
  private readonly skillSets = new Map<string, EngineSkillSet>()
  private readonly mcpSets = new Map<string, EngineMcpSet>()

  registerSkillSet(input: EngineSkillSet): EngineSkillSet {
    const set = {
      ...input,
      id: nonEmpty(input.id, 'skill set id'),
      pluginDirs: [...input.pluginDirs],
      additionalDirectories: [...input.additionalDirectories],
    }
    if (this.skillSets.has(set.id)) throw new Error(`skill set already registered: ${set.id}`)
    this.skillSets.set(set.id, set)
    return set
  }

  registerMcpSet(input: EngineMcpSet): EngineMcpSet {
    const id = nonEmpty(input.id, 'MCP set id')
    const servers = input.servers.map(normalizeServer)
    const ids = new Set<string>()
    for (const server of servers) {
      if (ids.has(server.id)) throw new Error(`MCP set ${id} contains duplicate server: ${server.id}`)
      ids.add(server.id)
    }
    const set = { id, servers }
    if (this.mcpSets.has(id)) throw new Error(`MCP set already registered: ${id}`)
    this.mcpSets.set(id, set)
    return set
  }

  replaceSkillSets(inputs: readonly EngineSkillSet[]): void {
    const next = inputs.map(input => ({
      ...input,
      id: nonEmpty(input.id, 'skill set id'),
      pluginDirs: [...input.pluginDirs],
      additionalDirectories: [...input.additionalDirectories],
    }))
    const ids = new Set<string>()
    for (const set of next) {
      if (ids.has(set.id)) throw new Error(`skill set already registered: ${set.id}`)
      ids.add(set.id)
    }
    this.skillSets.clear()
    for (const set of next) this.skillSets.set(set.id, set)
  }

  replaceMcpSets(inputs: readonly EngineMcpSet[]): void {
    const next = inputs.map(input => {
      const id = nonEmpty(input.id, 'MCP set id')
      const servers = input.servers.map(normalizeServer)
      const ids = new Set<string>()
      for (const server of servers) {
        if (ids.has(server.id)) throw new Error(`MCP set ${id} contains duplicate server: ${server.id}`)
        ids.add(server.id)
      }
      return { id, servers }
    })
    const ids = new Set<string>()
    for (const set of next) {
      if (ids.has(set.id)) throw new Error(`MCP set already registered: ${set.id}`)
      ids.add(set.id)
    }
    this.mcpSets.clear()
    for (const set of next) this.mcpSets.set(set.id, set)
  }

  skillSet(id: string): EngineSkillSet {
    const set = this.skillSets.get(id)
    if (set === undefined) throw new Error(`unknown skill set: ${id}`)
    return set
  }

  mcpSet(id: string): EngineMcpSet {
    const set = this.mcpSets.get(id)
    if (set === undefined) throw new Error(`unknown MCP set: ${id}`)
    return set
  }

  listSkillSets(): readonly EngineSkillSet[] { return [...this.skillSets.values()] }
  listMcpSets(): readonly EngineMcpSet[] { return [...this.mcpSets.values()] }
}
