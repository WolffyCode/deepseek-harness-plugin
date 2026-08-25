import type { EngineDefinition } from './engine/types.js'
import { openCodexLaunch, type CodexLaunch, type CodexLaunchOptions } from './codex/launch.js'
import { EngineRegistry, ModelCatalog, ProviderRegistry } from './registry.js'
import { resolveEngineProfile } from './profile/resolver.js'
import type { EngineProfileSnapshot, EngineSelection } from './profile/types.js'

export * from './debug-provider.js'
export * from './engine/types.js'
export * from './model/types.js'
export * from './profile/types.js'
export * from './provider/types.js'
export * from './profile/resolver.js'
export * from './registry.js'

export const name = 'dsh-engine-suite'

export const CODEX_ENGINE: EngineDefinition = {
  id: 'codex-cli',
  type: 'codex-cli',
  displayName: 'Codex CLI',
  capabilities: {
    streaming: true,
    sessionResume: true,
    modelDiscovery: true,
    reasoningDiscovery: true,
    approvals: true,
    mcp: true,
    skills: true,
    backgroundAgent: false,
    steer: true,
    fork: false,
  },
}

export interface EngineSuite {
  readonly engines: EngineRegistry
  readonly providers: ProviderRegistry
  readonly models: ModelCatalog
  resolveProfile(selection: EngineSelection): EngineProfileSnapshot
  openCodex(selection: EngineSelection, options: Omit<CodexLaunchOptions, 'profile' | 'provider' | 'model'>): Promise<CodexLaunch>
}

export function createEngineSuite(): EngineSuite {
  const engines = new EngineRegistry()
  engines.register(CODEX_ENGINE)
  const providers = new ProviderRegistry()
  const models = new ModelCatalog()
  return {
    engines,
    providers,
    models,
    resolveProfile: selection => resolveEngineProfile({ engines, providers, models }, selection),
    openCodex: async (selection, options) => {
      const profile = resolveEngineProfile({ engines, providers, models }, selection)
      return openCodexLaunch({
        ...options,
        profile,
        provider: providers.get(profile.providerId),
        model: models.get(profile.modelRecordId),
      })
    },
  }
}
export * from './codex/json-rpc.js'
export * from './codex/process.js'
export * from './codex/runtime.js'
export * from './codex/config.js'
export * from './codex/launch.js'
export * from './plugin.js'
export * from './agent/external-codex-agent.js'
export * from './agent/service.js'
export * from './settings.js'
