import { bindTypertRemote, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertGatewayBinding } from '@deepseek-ai/dsh-typert-protocol'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { EngineSuiteRuntimeService } from './plugin.js'
import { resolveApiKey } from './credential.js'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { EngineSelection } from './profile/types.js'

import type {
  EngineSuiteCatalogView,
  EngineSuiteCreateAgentRequest,
  EngineSuiteCreateAgentResponse,
  EngineSuiteDiscoverModelsResponse,
  EngineSuiteSwitchAgentRequest,
  EngineSuiteSwitchAgentResponse,
  EngineSuiteCommandView,
  EngineSuiteCommandsResponse,
  EngineSuiteProfileView, EngineSuiteSkillSetView, EngineSuiteMcpSetView,
} from './types.js'

export type {
  EngineSuiteCatalogView,
  EngineSuiteCreateAgentRequest,
  EngineSuiteCreateAgentResponse,
  EngineSuiteDiscoverModelsResponse,
  EngineSuiteSwitchAgentRequest,
  EngineSuiteSwitchAgentResponse,
  EngineSuiteCommandView,
  EngineSuiteCommandsResponse,
  EngineSuiteProfileView, EngineSuiteSkillSetView, EngineSuiteMcpSetView,
} from './types.js'

/** Host remote surface used by the client selector and settings UI. */
export class EngineSuiteGateway extends Service {
  static inject = ['engineSuite']

  readonly typertRemote: TypertGatewayBinding<this> = bindTypertRemote(this, 'engineSuiteGateway')
  private readonly engineSuite: EngineSuiteRuntimeService

  constructor(ctx: Context) {
    super(ctx, 'engineSuiteGateway')
    this.engineSuite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  }

  @Remote('catalog')
  async catalog(): Promise<EngineSuiteCatalogView> {
    const ownEngines = this.engineSuite.engines.list().map(engine => ({
      id: engine.id,
      type: engine.type,
      displayName: engine.displayName,
      capabilities: { ...engine.capabilities },
    }))
    const ownProviders = this.engineSuite.providers.list().map(provider => ({
      id: provider.id,
      engineId: provider.engineId,
      name: provider.name,
      baseUri: provider.baseUri,
      wireApi: provider.wireApi,
      authMode: provider.authMode,
      enabled: provider.enabled,
      status: provider.status,
    }))
    const ownModels = this.engineSuite.models.list().map(model => ({
      id: model.id,
      engineId: model.engineId,
      providerId: model.providerId,
      modelId: model.modelId,
      ...model.displayName === undefined ? {} : { displayName: model.displayName },
      ...model.description === undefined ? {} : { description: model.description },
      enabled: model.enabled,
      hidden: model.hidden,
      reasoningOptions: model.reasoningOptions.map(option => ({
        id: option.id,
        ...option.description === undefined ? {} : { description: option.description },
      })),
      ...model.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
      inputModalities: [...model.inputModalities],
      ...model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens },
      contextWindowSource: model.contextWindowSource,
      source: model.source,
    }))

    const ownProfiles = this.engineSuite.profiles.list().map(profile => ({
      id: profile.id,
      name: profile.name ?? profile.id,
      engineId: profile.selection.engineId,
      providerId: profile.selection.providerId,
      modelRecordId: profile.selection.modelRecordId,
      ...profile.selection.reasoningEffort === undefined ? {} : { reasoningEffort: profile.selection.reasoningEffort },
      ...profile.skillSetRef === undefined ? {} : { skillSetRef: profile.skillSetRef },
      ...profile.mcpSetRef === undefined ? {} : { mcpSetRef: profile.mcpSetRef },
      allowedChildProfiles: [...profile.allowedChildProfiles ?? []],
      maxChildDepth: profile.maxChildDepth ?? 1,
      maxConcurrentChildren: profile.maxConcurrentChildren ?? 1,
      enabled: profile.enabled !== false,
    }))
    const skillSets = this.engineSuite.assets.listSkillSets().map(set => ({
      id: set.id, pluginDirs: [...set.pluginDirs], additionalDirectories: [...set.additionalDirectories],
    }))
    const mcpSets = this.engineSuite.assets.listMcpSets().map(set => ({
      id: set.id,
      servers: set.servers.map(server => ({ id: server.id, name: server.name, transport: server.transport })),
    }))
    const native = await this.nativeCatalog(new Set(ownProviders.map(provider => provider.id)))
    return {
      engines: [...ownEngines, native.engine],
      providers: [...ownProviders, ...native.providers],
      models: [...ownModels, ...native.models],
      profiles: ownProfiles,
      skillSets,
      mcpSets,
    }
  }

  private async nativeCatalog(ownProviderIds: ReadonlySet<string>): Promise<{
    readonly engine: EngineSuiteCatalogView['engines'][number]
    readonly providers: readonly EngineSuiteCatalogView['providers'][number][]
    readonly models: readonly EngineSuiteCatalogView['models'][number][]
  }> {
    const engine = {
      id: 'deepseek-native',
      type: 'deepseek-native',
      displayName: 'DeepSeek 内置',
      capabilities: {
        streaming: true, sessionResume: true, modelDiscovery: true, reasoningDiscovery: true,
        approvals: true, mcp: true, skills: true, backgroundAgent: true, steer: true, fork: true,
      },
    }
    const llm = this.ctx.get('llm') as LlmRuntime | undefined
    if (llm === undefined) return { engine, providers: [], models: [] }
    const providers: EngineSuiteCatalogView['providers'][number][] = []
    const models: EngineSuiteCatalogView['models'][number][] = []
    for (const provider of llm.listProviders()) {
      if (ownProviderIds.has(provider.id)) continue
      providers.push({
        id: provider.id,
        engineId: engine.id,
        name: provider.name,
        baseUri: '',
        wireApi: 'responses',
        authMode: 'api-key',
        enabled: true,
        status: 'available',
      })
      let advertised: Awaited<ReturnType<LlmRuntime['listModels']>>
      try {
        advertised = await llm.listModels(provider.id)
      } catch {
        advertised = []
      }
      for (const model of advertised) {
        let exact: Awaited<ReturnType<LlmRuntime['resolveModelInfo']>> | undefined
        try {
          exact = await llm.resolveModelInfo(provider.id, model.id)
        } catch {
          exact = undefined
        }
        const reasoningOptions = exact?.reasoning?.efforts ?? []
        models.push({
          id: `${provider.id}/${model.id}`,
          engineId: engine.id,
          providerId: provider.id,
          modelId: model.id,
          displayName: exact?.name ?? model.name,
          ...exact?.description ?? model.description
            ? { description: exact?.description ?? model.description }
            : {},
          enabled: true,
          hidden: false,
          reasoningOptions: reasoningOptions.map(option => ({ id: option.id, ...option.description === undefined ? {} : { description: option.description } })),
          ...exact?.reasoning?.defaultEffort === undefined ? {} : { defaultReasoningEffort: exact.reasoning.defaultEffort },
          inputModalities: [...exact?.inputModalities ?? model.inputModalities ?? ['text']],
          ...exact?.context?.contextWindow === undefined ? {} : { contextWindowTokens: exact.context.contextWindow },
          contextWindowSource: exact?.context?.contextWindow === undefined ? 'unknown' : 'discovered',
          source: 'discovered',
        })
      }
    }
    return { engine, providers, models }
  }

  @Remote('createAgent')
  async createAgent(request: EngineSuiteCreateAgentRequest): Promise<EngineSuiteCreateAgentResponse> {
    const selection: EngineSelection = {
      engineId: request.selection.engineId,
      providerId: request.selection.providerId,
      modelRecordId: request.selection.modelRecordId,
      ...request.selection.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: request.selection.reasoningEffort },
    }
    const profile = this.engineSuite.resolveProfile(selection)
    const provider = this.engineSuite.providers.get(profile.providerId)
    const apiKey = await resolveApiKey(this.ctx, provider.credentialRef)
    const existing = this.engineSuite.agents.list().find(candidate => String(candidate.session.id) === request.sessionId)
    const handle = existing === undefined
      ? await this.engineSuite.agents.createExternal({
          sessionId: request.sessionId,
          selection,
          apiKey,
          cwd: request.cwd || this.ctx.get('sessions')?.get(SessionId(request.sessionId))?.header.cwd || process.cwd(),
        })
      : (await existing.updateSelection(selection, apiKey), existing)
    return {
      sessionId: String(handle.session.id),
      agentId: String(handle.agent.id),
      profileId: handle.profileId,
    }
  }

  @Remote('switchAgent')
  async switchAgent(request: EngineSuiteSwitchAgentRequest): Promise<EngineSuiteSwitchAgentResponse> {
    const selection: EngineSelection = {
      engineId: request.selection.engineId,
      providerId: request.selection.providerId,
      modelRecordId: request.selection.modelRecordId,
      ...request.selection.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: request.selection.reasoningEffort },
    }
    const profile = this.engineSuite.resolveProfile(selection)
    const provider = this.engineSuite.providers.get(profile.providerId)
    const apiKey = await resolveApiKey(this.ctx, provider.credentialRef)
    const handle = await this.engineSuite.agents.switchExternal(request.sessionId, selection, apiKey)
    return {
      sessionId: String(handle.session.id),
      agentId: String(handle.agent.id),
      profileId: handle.profileId,
    }
  }

  @Remote('sessionCommands')
  async sessionCommands(sessionId: string, refresh: boolean): Promise<EngineSuiteCommandsResponse> {
    const commands = await this.engineSuite.agents.listCommands(sessionId, refresh)
    return { sessionId, commands: commands.map(command => ({
      name: command.name,
      description: command.description,
      argumentHint: command.argumentHint,
      source: command.source,
    } satisfies EngineSuiteCommandView)) }
  }

  @Remote('discoverModels')
  async discoverModels(providerId: string): Promise<EngineSuiteDiscoverModelsResponse> {
    const provider = this.engineSuite.providers.get(providerId)
    const models = provider.engineId === 'codex-cli'
      ? await this.engineSuite.discoverCodexModels(providerId, {
          apiKey: await resolveApiKey(this.ctx, provider.credentialRef),
          cwd: process.cwd(),
        })
      : this.engineSuite.models.list(providerId)
    return {
      models: models.map(model => ({
        id: model.id,
        engineId: model.engineId,
        providerId: model.providerId,
        modelId: model.modelId,
        ...model.displayName === undefined ? {} : { displayName: model.displayName },
        ...model.description === undefined ? {} : { description: model.description },
        enabled: model.enabled,
        hidden: model.hidden,
        reasoningOptions: model.reasoningOptions.map(option => ({
          id: option.id,
          ...option.description === undefined ? {} : { description: option.description },
        })),
        ...model.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
        inputModalities: [...model.inputModalities],
        ...model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens },
        contextWindowSource: model.contextWindowSource,
        source: model.source,
      })),
    }
  }

  @Remote('cancelAgent')
  async cancelAgent(agentId: string): Promise<void> {
    const handle = this.engineSuite.agents.list().find(candidate => String(candidate.agent.id) === agentId)
    if (handle === undefined) throw new Error(`unknown engine-suite agent: ${agentId}`)
    handle.agent.cancel({ kind: 'user' })
  }

}
