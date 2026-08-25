import type { EngineDefinition } from './engine/types.js'
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
  }
}
