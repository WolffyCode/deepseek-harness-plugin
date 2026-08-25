export type EngineId = string

export type EngineType = 'codex-cli' | 'claude-cli' | 'deepseek-native'

export interface EngineCapabilities {
  readonly streaming: boolean
  readonly sessionResume: boolean
  readonly modelDiscovery: boolean
  readonly reasoningDiscovery: boolean
  readonly approvals: boolean
  readonly mcp: boolean
  readonly skills: boolean
  readonly backgroundAgent: boolean
  readonly steer: boolean
  readonly fork: boolean
}

export interface EngineDefinition {
  readonly id: EngineId
  readonly type: EngineType
  readonly displayName: string
  readonly executable?: string
  readonly version?: string
  readonly capabilities: EngineCapabilities
}

export function assertEngineId(id: string): EngineId {
  const normalized = id.trim()
  if (normalized.length === 0) throw new Error('engine id must not be empty')
  return normalized
}
