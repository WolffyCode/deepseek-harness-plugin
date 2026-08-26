import type { EngineSuiteCatalogView, EngineSuiteEngineView, EngineSuiteModelView, EngineSuiteProviderView } from '../types.js'

export interface EngineSuiteComposerSelection {
  readonly engineId: string
  readonly providerId: string
  readonly modelRecordId: string
  readonly reasoningEffort: string
}

export function engineSelectionLocked(locked: boolean, sessionBlank: boolean | undefined): boolean {
  return locked || sessionBlank !== true
}

export function enabledEngines(catalog: EngineSuiteCatalogView): readonly EngineSuiteEngineView[] {
  return catalog.engines
}

function normalizedQuery(query: string): string {
  return query.trim().toLocaleLowerCase()
}

function includesQuery(values: readonly string[], query: string): boolean {
  const normalized = normalizedQuery(query)
  return normalized === '' || values.some(value => value.toLocaleLowerCase().includes(normalized))
}

export function filterEngineOptions(engines: readonly EngineSuiteEngineView[], query: string): readonly EngineSuiteEngineView[] {
  return engines.filter(engine => includesQuery([engine.displayName, engine.id, engine.type], query))
}

export function filterProviderOptions(providers: readonly EngineSuiteProviderView[], query: string): readonly EngineSuiteProviderView[] {
  return providers.filter(provider => includesQuery([provider.name, provider.id, provider.baseUri], query))
}

export function filterModelOptions(models: readonly EngineSuiteModelView[], query: string): readonly EngineSuiteModelView[] {
  return models.filter(model => includesQuery([model.displayName ?? '', model.modelId, model.id, model.description ?? ''], query))
}

export function enabledProviders(catalog: EngineSuiteCatalogView, engineId: string): readonly EngineSuiteProviderView[] {
  return catalog.providers.filter(provider => provider.engineId === engineId && provider.enabled)
}

export function enabledModels(catalog: EngineSuiteCatalogView, providerId: string): readonly EngineSuiteModelView[] {
  return catalog.models.filter(model => model.providerId === providerId && model.enabled && !model.hidden)
}

export function defaultReasoningEffort(model: EngineSuiteModelView | undefined): string {
  return model?.defaultReasoningEffort ?? model?.reasoningOptions[0]?.id ?? ''
}

export function resolveEngineSelection(catalog: EngineSuiteCatalogView, engineId: string): EngineSuiteComposerSelection {
  const provider = enabledProviders(catalog, engineId)[0]
  const model = enabledModels(catalog, provider?.id ?? '')[0]
  return {
    engineId,
    providerId: provider?.id ?? '',
    modelRecordId: model?.id ?? '',
    reasoningEffort: defaultReasoningEffort(model),
  }
}

export function resolveProviderSelection(catalog: EngineSuiteCatalogView, engineId: string, providerId: string): EngineSuiteComposerSelection {
  const model = enabledModels(catalog, providerId)[0]
  return {
    engineId,
    providerId,
    modelRecordId: model?.id ?? '',
    reasoningEffort: defaultReasoningEffort(model),
  }
}

export function resolveModelSelection(models: readonly EngineSuiteModelView[], modelRecordId: string): Pick<EngineSuiteComposerSelection, 'modelRecordId' | 'reasoningEffort'> {
  const model = models.find(candidate => candidate.id === modelRecordId)
  return {
    modelRecordId,
    reasoningEffort: defaultReasoningEffort(model),
  }
}
