import test from 'node:test'
import assert from 'node:assert/strict'
import type { EngineSuiteCatalogView } from '../src/types.js'
import { defaultReasoningEffort, enabledModels, engineSelectionLocked, enabledProviders, resolveEngineSelection, resolveModelSelection, resolveProviderSelection } from '../src/client/composer-selection.js'

const catalog: EngineSuiteCatalogView = {
  engines: [
    { id: 'claude-cli', type: 'claude-cli', displayName: 'Claude CLI', capabilities: {} as never },
    { id: 'codex-cli', type: 'codex-cli', displayName: 'Codex CLI', capabilities: {} as never },
  ],
  providers: [
    { id: 'glm-opencodebay', engineId: 'claude-cli', name: 'GLM (Paseo / OpenCodeBay)', baseUri: 'https://sub2api.opencodebay.com', wireApi: 'anthropic', authMode: 'auth-token', enabled: true, status: 'available' },
    { id: 'codex-opencodebay', engineId: 'codex-cli', name: 'Codex (Paseo / OpenCodeBay)', baseUri: 'https://sub2api.opencodebay.com', wireApi: 'responses', authMode: 'api-key', enabled: true, status: 'available' },
  ],
  models: [
    { id: 'glm-opencodebay/glm-5.3', engineId: 'claude-cli', providerId: 'glm-opencodebay', modelId: 'glm-5.3', displayName: 'GLM 5.3', enabled: true, hidden: false, reasoningOptions: [{ id: 'low' }, { id: 'max' }], defaultReasoningEffort: 'max', inputModalities: ['text'], contextWindowTokens: 1_000_000, contextWindowSource: 'manual', source: 'manual' },
    { id: 'codex-opencodebay/gpt-5.2', engineId: 'codex-cli', providerId: 'codex-opencodebay', modelId: 'gpt-5.2', displayName: 'GPT-5.2', enabled: true, hidden: false, reasoningOptions: [{ id: 'medium' }, { id: 'high' }], defaultReasoningEffort: 'high', inputModalities: ['text'], contextWindowTokens: 200_000, contextWindowSource: 'discovered', source: 'discovered' },
    { id: 'codex-opencodebay/hidden', engineId: 'codex-cli', providerId: 'codex-opencodebay', modelId: 'hidden', enabled: true, hidden: true, reasoningOptions: [], inputModalities: ['text'], contextWindowSource: 'unknown', source: 'manual' },
  ],
  profiles: [],
  skillSets: [],
  mcpSets: [],
}

test('engine selection is editable only for a blank session', () => {
  assert.equal(engineSelectionLocked(false, true), false)
  assert.equal(engineSelectionLocked(false, false), true)
  assert.equal(engineSelectionLocked(false, undefined), true)
  assert.equal(engineSelectionLocked(true, true), true)
})

test('composer catalog only exposes enabled providers and visible models', () => {
  assert.equal(enabledProviders(catalog, 'claude-cli').map(provider => provider.id).join(','), 'glm-opencodebay')
  assert.equal(enabledModels(catalog, 'codex-opencodebay').map(model => model.id).join(','), 'codex-opencodebay/gpt-5.2')
})

test('GLM 5.3 max is the default Claude CLI selection', () => {
  assert.deepEqual(resolveEngineSelection(catalog, 'claude-cli'), {
    engineId: 'claude-cli',
    providerId: 'glm-opencodebay',
    modelRecordId: 'glm-opencodebay/glm-5.3',
    reasoningEffort: 'max',
  })
})

test('changing engine resets the provider, model, and reasoning together', () => {
  assert.deepEqual(resolveEngineSelection(catalog, 'codex-cli'), {
    engineId: 'codex-cli',
    providerId: 'codex-opencodebay',
    modelRecordId: 'codex-opencodebay/gpt-5.2',
    reasoningEffort: 'high',
  })
})

test('changing provider chooses its first visible model and advertised default effort', () => {
  assert.deepEqual(resolveProviderSelection(catalog, 'codex-cli', 'codex-opencodebay'), {
    engineId: 'codex-cli',
    providerId: 'codex-opencodebay',
    modelRecordId: 'codex-opencodebay/gpt-5.2',
    reasoningEffort: 'high',
  })
})

test('changing model never keeps an invalid reasoning effort', () => {
  const model = catalog.models[0]
  assert.ok(model)
  assert.deepEqual(resolveModelSelection([model], model.id), { modelRecordId: model.id, reasoningEffort: 'max' })
  assert.equal(defaultReasoningEffort(undefined), '')
})

test('composer search filters engines, providers, and models without changing catalog order', async () => {
  const { filterEngineOptions, filterModelOptions, filterProviderOptions } = await import('../src/client/composer-selection.js')
  assert.deepEqual(filterEngineOptions(catalog.engines, 'codex').map(engine => engine.id), ['codex-cli'])
  assert.deepEqual(filterProviderOptions(catalog.providers, 'openCode').map(provider => provider.id), ['glm-opencodebay', 'codex-opencodebay'])
  assert.deepEqual(filterModelOptions(catalog.models, 'GPT').map(model => model.id), ['codex-opencodebay/gpt-5.2'])
  assert.equal(filterEngineOptions(catalog.engines, '   ').length, catalog.engines.length)
})
