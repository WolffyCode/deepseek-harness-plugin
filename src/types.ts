/** Client-safe wire contracts for the Engine Suite Host Remote. */

export interface EngineSuiteEngineView {
  readonly id: string
  readonly type: string
  readonly displayName: string
  readonly capabilities: {
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
}

export interface EngineSuiteProviderView {
  readonly id: string
  readonly engineId: string
  readonly name: string
  readonly baseUri: string
  readonly wireApi: string
  readonly authMode: string
  readonly enabled: boolean
  readonly status: string
}

export interface EngineSuiteReasoningOptionView {
  readonly id: string
  readonly description?: string
}

export interface EngineSuiteModelView {
  readonly id: string
  readonly engineId: string
  readonly providerId: string
  readonly modelId: string
  readonly displayName?: string
  readonly description?: string
  readonly enabled: boolean
  readonly hidden: boolean
  readonly reasoningOptions: readonly EngineSuiteReasoningOptionView[]
  readonly defaultReasoningEffort?: string
  readonly inputModalities: readonly string[]
  readonly contextWindowTokens?: number
  readonly contextWindowSource: string
  readonly source: string
}

export interface EngineSuiteProfileView {
  readonly id: string
  readonly name: string
  readonly engineId: string
  readonly providerId: string
  readonly modelRecordId: string
  readonly reasoningEffort?: string
  readonly skillSetRef?: string
  readonly mcpSetRef?: string
  readonly allowedChildProfiles: readonly string[]
  readonly maxChildDepth: number
  readonly maxConcurrentChildren: number
  readonly enabled: boolean
}

export interface EngineSuiteSkillSetView {
  readonly id: string
  readonly pluginDirs: readonly string[]
  readonly additionalDirectories: readonly string[]
}

export interface EngineSuiteMcpServerView {
  readonly id: string
  readonly name: string
  readonly transport: string
}

export interface EngineSuiteMcpSetView {
  readonly id: string
  readonly servers: readonly EngineSuiteMcpServerView[]
}

export type EngineSuiteCommandSource = 'command' | 'skill'

export interface EngineSuiteCommandView {
  readonly name: string
  readonly description: string
  readonly argumentHint: string
  readonly source: EngineSuiteCommandSource
}

export interface EngineSuiteCommandsResponse {
  readonly sessionId: string
  readonly commands: readonly EngineSuiteCommandView[]
}

export interface EngineSuiteCatalogView {
  readonly engines: readonly EngineSuiteEngineView[]
  readonly providers: readonly EngineSuiteProviderView[]
  readonly models: readonly EngineSuiteModelView[]
  readonly profiles: readonly EngineSuiteProfileView[]
  readonly skillSets: readonly EngineSuiteSkillSetView[]
  readonly mcpSets: readonly EngineSuiteMcpSetView[]
}

export interface EngineSuiteSelectionRequest {
  readonly engineId: string
  readonly providerId: string
  readonly modelRecordId: string
  readonly reasoningEffort?: string
}

export interface EngineSuiteCreateAgentRequest {
  readonly sessionId: string
  readonly selection: EngineSuiteSelectionRequest
  readonly cwd: string
}

export interface EngineSuiteCreateAgentResponse {
  readonly sessionId: string
  readonly agentId: string
  readonly profileId: string
}

export interface EngineSuiteSwitchAgentRequest {
  readonly sessionId: string
  readonly selection: EngineSuiteSelectionRequest
}

export interface EngineSuiteSwitchAgentResponse {
  readonly sessionId: string
  readonly agentId: string
  readonly profileId: string
}

export interface EngineSuiteDiscoverModelsResponse {
  readonly models: readonly EngineSuiteModelView[]
}
