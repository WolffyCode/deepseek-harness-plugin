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

  replaceAll(inputs: readonly CreateProviderInput[]): void {
    const next = inputs.map(createProvider)
    const ids = new Set<ProviderId>()
    for (const provider of next) {
      if (ids.has(provider.id)) throw new Error(`provider already registered: ${provider.id}`)
      ids.add(provider.id)
    }
    this.providers.clear()
    for (const provider of next) this.providers.set(provider.id, provider)
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

  replaceAll(inputs: readonly CreateModelInput[]): void {
    const next = inputs.map(createModel)
    const ids = new Set<ModelRecordId>()
    for (const model of next) {
      if (ids.has(model.id)) throw new Error(`model already registered: ${model.id}`)
      ids.add(model.id)
    }
    this.models.clear()
    for (const model of next) this.models.set(model.id, model)
  }

  get(id: ModelRecordId): ModelRecord {
    const model = this.models.get(id)
    if (model === undefined) throw new Error(`unknown model record: ${id}`)
    return model
  }

  list(providerId?: ProviderId): readonly ModelRecord[] {
    return [...this.models.values()].filter(model => providerId === undefined || model.providerId === providerId)
  }

  replaceProvider(providerId: ProviderId, models: readonly ModelRecord[]): void {
    for (const [id, model] of this.models) {
      if (model.providerId === providerId) this.models.delete(id)
    }
    for (const model of models) {
      if (model.providerId !== providerId) throw new Error(`model ${model.id} does not belong to provider ${providerId}`)
      if (this.models.has(model.id)) throw new Error(`model already registered: ${model.id}`)
      this.models.set(model.id, model)
    }
  }
}
