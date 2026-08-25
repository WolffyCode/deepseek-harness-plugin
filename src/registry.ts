import type { EngineDefinition, EngineId } from './engine/types.js'
import type { CreateModelInput, ModelRecord, ModelRecordId } from './model/types.js'
import { createModel } from './model/types.js'
import type { CreateProviderInput, EngineProvider, ProviderId } from './provider/types.js'
import { createProvider } from './provider/types.js'

export class EngineRegistry {
  private readonly definitions = new Map<EngineId, EngineDefinition>()

  register(definition: EngineDefinition): void {
    if (this.definitions.has(definition.id)) throw new Error(`engine already registered: ${definition.id}`)
    this.definitions.set(definition.id, definition)
  }

  get(id: EngineId): EngineDefinition {
    const definition = this.definitions.get(id)
    if (definition === undefined) throw new Error(`unknown engine: ${id}`)
    return definition
  }

  list(): readonly EngineDefinition[] {
    return [...this.definitions.values()]
  }
}

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, EngineProvider>()

  register(input: CreateProviderInput): EngineProvider {
    const provider = createProvider(input)
    if (this.providers.has(provider.id)) throw new Error(`provider already registered: ${provider.id}`)
    this.providers.set(provider.id, provider)
    return provider
  }

  get(id: ProviderId): EngineProvider {
    const provider = this.providers.get(id)
    if (provider === undefined) throw new Error(`unknown provider: ${id}`)
    return provider
  }

  list(engineId?: EngineId): readonly EngineProvider[] {
    return [...this.providers.values()].filter(provider => engineId === undefined || provider.engineId === engineId)
  }
}

export class ModelCatalog {
  private readonly models = new Map<ModelRecordId, ModelRecord>()

  register(input: CreateModelInput): ModelRecord {
    const model = createModel(input)
    if (this.models.has(model.id)) throw new Error(`model already registered: ${model.id}`)
    this.models.set(model.id, model)
    return model
  }

  get(id: ModelRecordId): ModelRecord {
    const model = this.models.get(id)
    if (model === undefined) throw new Error(`unknown model record: ${id}`)
    return model
  }

  list(providerId?: ProviderId): readonly ModelRecord[] {
    return [...this.models.values()].filter(model => providerId === undefined || model.providerId === providerId)
  }
}
