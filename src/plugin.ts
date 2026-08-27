import type { Context } from '@deepseek-ai/cordis'
import type { AgentHandle, CreateAgentOptions, ResumeAgentOptions } from '@deepseek-ai/dsh-agent'
import { createEngineSuiteRuntime } from './engine-suite.js'
import type { EngineSuite } from './engine-suite.js'
import { EngineSuiteAgentService, type HostAgentHandleStore } from './agent/service.js'
import { readDebugCodexProviderSeed, readDebugGlmProviderSeed } from './debug-provider.js'
import { registerEngineSuiteSettings, syncEngineSuiteSettings, type EngineSuiteSettings } from './settings.js'
import { EngineSuiteGateway } from './remote.js'
import { ExternalEngineLlmRouteRegistration } from './llm-route.js'
import { resolveApiKey } from './credential.js'

/** One installed bundle entry; child capabilities are owned by this plugin. */
export const inject = ['agents', 'sessions']

interface HostAgentRegistryLike {
  create(options: CreateAgentOptions): Promise<AgentHandle>
  resume(options: ResumeAgentOptions): Promise<AgentHandle>
}

function trackHostAgentHandles(ctx: Context): HostAgentHandleStore | undefined {
  const registry = ctx.get('agents') as HostAgentRegistryLike | undefined
  if (registry === undefined) return undefined
  const handles = new Map<string, AgentHandle>()
  const pending = new Map<string, Promise<AgentHandle>>()
  let active = true
  const track = (id: string, operation: Promise<AgentHandle>): Promise<AgentHandle> => {
    pending.set(id, operation)
    void operation.then(handle => {
      if (active) handles.set(id, handle)
      if (pending.get(id) === operation) pending.delete(id)
    }, () => {
      if (pending.get(id) === operation) pending.delete(id)
    })
    return operation
  }
  const originalCreate = registry.create
  const originalResume = registry.resume
  registry.create = (options) => track(String(options.sessionId), originalCreate.call(registry, options))
  registry.resume = (options) => track(String(options.resumeSessionId), originalResume.call(registry, options))
  ctx.effect(() => () => {
    active = false
    registry.create = originalCreate
    registry.resume = originalResume
    handles.clear()
    pending.clear()
  }, 'engine-suite.host-agent-handles')
  return {
    wait: async (sessionId, agent) => {
      const current = handles.get(sessionId)
      if (current !== undefined) return current.agent === agent ? current : undefined
      const started = pending.get(sessionId)
      if (started === undefined) return undefined
      const handle = await started
      return handle.agent === agent ? handle : undefined
    },
    take: (sessionId, agent) => {
      const handle = handles.get(sessionId)
      if (handle?.agent !== agent) return undefined
      handles.delete(sessionId)
      return handle
    },
  }
}

function overlayDebugSettings(
  value: EngineSuiteSettings,
  debug: EngineSuiteSettings | undefined,
): EngineSuiteSettings {
  if (debug === undefined) return value
  const providerIds = new Set(value.providers.map(provider => provider.id))
  const modelIds = new Set(value.models.map(model => model.id))
  const profileIds = new Set((value.profiles ?? []).map(profile => profile.id))
  return {
    providers: [
      ...debug.providers.filter(provider => !providerIds.has(provider.id)),
      ...value.providers,
    ],
    models: [
      ...debug.models.filter(model => !modelIds.has(model.id)),
      ...value.models,
    ],
    profiles: [
      ...(debug.profiles ?? []).filter(profile => !profileIds.has(profile.id)),
      ...(value.profiles ?? []),
    ],
    skillSets: value.skillSets ?? [],
    mcpSets: value.mcpSets ?? [],
  }
}

function debugBaseSettings(
  glmSeed: ReturnType<typeof readDebugGlmProviderSeed>,
  codexSeed: ReturnType<typeof readDebugCodexProviderSeed>,
): EngineSuiteSettings | undefined {
  const providers = [
    ...glmSeed === undefined ? [] : [{
      id: glmSeed.provider.id,
      engineId: glmSeed.provider.engineId,
      name: glmSeed.provider.name,
      baseUri: glmSeed.provider.baseUri,
      credentialRef: glmSeed.provider.credentialRef,
      wireApi: 'anthropic' as const,
      authMode: 'auth-token' as const,
      enabled: true,
    }],
    ...codexSeed === undefined ? [] : [{
      id: codexSeed.provider.id,
      engineId: codexSeed.provider.engineId,
      name: codexSeed.provider.name,
      baseUri: codexSeed.provider.baseUri,
      credentialRef: codexSeed.provider.credentialRef,
      wireApi: 'responses' as const,
      authMode: 'api-key' as const,
      enabled: true,
    }],
  ]
  const models: EngineSuiteSettings['models'] = [
    ...glmSeed === undefined ? [] : [{
      id: 'glm-opencodebay/glm-5.3', engineId: 'claude-cli', providerId: 'glm-opencodebay',
      modelId: 'glm-5.3', displayName: 'GLM 5.3', enabled: true, hidden: false,
      reasoningOptions: ['low', 'medium', 'high', 'xhigh', 'max'], defaultReasoningEffort: 'max',
      contextWindowSource: 'unknown' as const,
    }],
    ...codexSeed === undefined ? [] : [{
      id: 'debug-sub2api-codex/gpt-5.6-sol', engineId: 'codex-cli', providerId: 'debug-sub2api-codex',
      modelId: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', enabled: true, hidden: false,
      reasoningOptions: ['low', 'medium', 'high', 'xhigh', 'max'], defaultReasoningEffort: 'low',
      contextWindowSource: 'unknown' as const,
    }],
  ]
  if (providers.length === 0 && models.length === 0) return undefined
  return { providers, models, profiles: [], skillSets: [], mcpSets: [] }
}

export function apply(ctx: Context): void {
  const suite = createEngineSuiteRuntime()
  const debugSeed = readDebugCodexProviderSeed(process.env)
  const glmSeed = readDebugGlmProviderSeed(process.env)
  if (glmSeed !== undefined) suite.providers.register(glmSeed.provider)
  if (debugSeed !== undefined) suite.providers.register(debugSeed.provider)
  const debugSettings = debugBaseSettings(glmSeed, debugSeed)
  const hostAgentHandles = trackHostAgentHandles(ctx)
  const llm = ctx.get('llm')
  const llmRoutes = llm === undefined ? undefined : new ExternalEngineLlmRouteRegistration(llm, suite)
  llmRoutes?.sync()
  ctx.effect(() => () => llmRoutes?.dispose(), 'engine-suite.llm-routes')
  const agents = new EngineSuiteAgentService(
    ctx,
    suite,
    credentialRef => resolveApiKey(ctx, credentialRef),
    undefined,
    undefined,
    hostAgentHandles,
  )
  registerEngineSuiteSettings(
    ctx,
    value => {
      syncEngineSuiteSettings(suite, overlayDebugSettings(value, debugSettings))
      llmRoutes?.sync()
    },
    undefined,
    debugSettings,
  )
  const service = Object.assign(suite, { agents }) satisfies EngineSuiteRuntimeService
  ctx.provide('engineSuite', service)
  ctx.plugin(EngineSuiteGateway)
}

export interface EngineSuiteService extends EngineSuite {}

export interface EngineSuiteRuntimeService extends EngineSuiteService {
  readonly agents: EngineSuiteAgentService
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    engineSuite: EngineSuiteService
    engineSuiteGateway: EngineSuiteGateway
  }
}

export type { EngineSuite }
