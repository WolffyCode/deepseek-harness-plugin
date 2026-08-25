import type { EngineDefinition } from './engine/types.js'
import type { ModelRecord } from './model/types.js'
import { discoverCodexModels, type CodexModelDiscoveryOptions } from './codex/discovery.js'
import { openCodexLaunch, type CodexLaunch, type CodexLaunchOptions } from './codex/launch.js'
import { EngineRegistry, ModelCatalog, ProviderRegistry } from './registry.js'
import { resolveEngineProfile } from './profile/resolver.js'
import type { EngineProfileSnapshot, EngineSelection } from './profile/types.js'

export interface OpenCodexOptions {
  readonly apiKey: string
  readonly cwd: string
  readonly executable?: string
  readonly args?: readonly string[]
  readonly disposeGraceMs?: number
}

export interface DiscoverCodexModelsOptions {
  readonly apiKey: string
  readonly cwd: string
  readonly executable?: string
  readonly args?: readonly string[]
  readonly disposeGraceMs?: number
}

export interface EngineSuite {
  readonly engines: EngineRegistry
  readonly providers: ProviderRegistry
  readonly models: ModelCatalog
  resolveProfile(selection: EngineSelection): EngineProfileSnapshot
  discoverCodexModels(providerId: string, options: DiscoverCodexModelsOptions): Promise<readonly ModelRecord[]>
}

/** Internal runtime face. It is intentionally not re-exported from the package root. */
export interface EngineSuiteRuntime extends EngineSuite {
  openCodex(selection: EngineSelection, options: OpenCodexOptions): Promise<CodexLaunch>
}

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

export function createEngineSuiteRuntime(): EngineSuiteRuntime {
  const engines = new EngineRegistry()
  engines.register(CODEX_ENGINE)
  const providers = new ProviderRegistry()
  const models = new ModelCatalog()
  return {
    engines,
    providers,
    models,
    resolveProfile: selection => resolveEngineProfile({ engines, providers, models }, selection),
    discoverCodexModels: async (providerId, options) => {
      const provider = providers.get(providerId)
      const discovered = await discoverCodexModels({ ...options, provider } satisfies CodexModelDiscoveryOptions)
      models.replaceProvider(providerId, discovered)
      return discovered
    },
    openCodex: async (selection, options) => {
      const profile = resolveEngineProfile({ engines, providers, models }, selection)
      return openCodexLaunch({
        ...options,
        profile,
        provider: providers.get(profile.providerId),
        model: models.get(profile.modelRecordId),
      } satisfies CodexLaunchOptions)
    },
  }
}

export function createEngineSuite(): EngineSuite {
  return createEngineSuiteRuntime()
}
