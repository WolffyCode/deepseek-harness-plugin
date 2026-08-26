import test from 'node:test'
import assert from 'node:assert/strict'
import type { EngineSuiteCatalogView, EngineSuiteSelectionRequest } from '../src/types.js'
import { createEngineSuiteCatalogController, type EngineSuiteRemoteGateway } from '../src/client/catalog.js'
import { getEngineSuiteSessionSelection, setEngineSuiteComposerRuntime, setEngineSuiteSessionSelection } from '../src/client/composer-runtime.js'
import { enabledModels, enabledProviders, engineSelectionLocked, filterModelOptions, resolveEngineSelection } from '../src/client/composer-selection.js'

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
    { id: 'glm-opencodebay/glm-5.3', engineId: 'claude-cli', providerId: 'glm-opencodebay', modelId: 'glm-5.3', displayName: 'GLM 5.3', enabled: true, hidden: false, reasoningOptions: [{ id: 'low' }, { id: 'max' }], defaultReasoningEffort: 'max', inputModalities: ['text'], contextWindowSource: 'manual', source: 'manual' },
    { id: 'glm-opencodebay/claude-opus-4', engineId: 'claude-cli', providerId: 'glm-opencodebay', modelId: 'claude-opus-4', displayName: 'Claude Opus 4', enabled: true, hidden: true, reasoningOptions: [], inputModalities: ['text'], contextWindowSource: 'manual', source: 'manual' },
    { id: 'codex-opencodebay/gpt-5.6-sol', engineId: 'codex-cli', providerId: 'codex-opencodebay', modelId: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', enabled: true, hidden: false, reasoningOptions: [{ id: 'low' }], defaultReasoningEffort: 'low', inputModalities: ['text'], contextWindowSource: 'discovered', source: 'discovered' },
  ],
  profiles: [],
  skillSets: [],
  mcpSets: [],
}

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value })

test('Host catalog drives Claude + GLM and Codex choices while hiding Opus', async () => {
  const created: EngineSuiteSelectionRequest[] = []
  const switched: EngineSuiteSelectionRequest[] = []
  const remote: EngineSuiteRemoteGateway = {
    catalog: () => ok(catalog),
    discoverModels: () => ok({ models: [] }),
    createAgent: request => { created.push(request.selection); return ok({ sessionId: request.sessionId, agentId: 'agent', profileId: 'profile' }) },
    sessionCommands: async () => ({ ok: true as const, value: { sessionId: 'session', commands: [] } }),
    switchAgent: request => { switched.push(request.selection); return ok({ sessionId: request.sessionId, agentId: 'agent', profileId: 'profile' }) },
  }
  const controller = createEngineSuiteCatalogController(remote)
  const actual = await controller.refresh()
  assert.deepEqual(enabledProviders(actual, 'claude-cli').map(provider => provider.name), ['GLM (Paseo / OpenCodeBay)'])
  assert.deepEqual(enabledModels(actual, 'glm-opencodebay').map(model => model.displayName), ['GLM 5.3'])
  assert.deepEqual(filterModelOptions(enabledModels(actual, 'glm-opencodebay'), 'opus'), [])
  assert.deepEqual(resolveEngineSelection(actual, 'claude-cli'), {
    engineId: 'claude-cli', providerId: 'glm-opencodebay', modelRecordId: 'glm-opencodebay/glm-5.3', reasoningEffort: 'max',
  })

  await controller.createAgent({ sessionId: 'blank', selection: resolveEngineSelection(actual, 'claude-cli'), cwd: '/tmp' })
  await controller.switchAgent({ sessionId: 'logged', selection: { engineId: 'codex-cli', providerId: 'codex-opencodebay', modelRecordId: 'codex-opencodebay/gpt-5.6-sol', reasoningEffort: 'low' } })
  assert.equal(created.length, 1)
  assert.equal(switched.length, 1)
})

test('session selection is a real client-side activity store, not a no-op', () => {
  const selection: EngineSuiteSelectionRequest = {
    engineId: 'claude-cli', providerId: 'glm-opencodebay', modelRecordId: 'glm-opencodebay/glm-5.3', reasoningEffort: 'max',
  }
  setEngineSuiteSessionSelection('persisted-session', selection)
  assert.deepEqual(getEngineSuiteSessionSelection('persisted-session'), selection)
  assert.equal(engineSelectionLocked(false, false), true)
  assert.equal(engineSelectionLocked(false, true), false)
  setEngineSuiteComposerRuntime(undefined)
  assert.equal(getEngineSuiteSessionSelection('persisted-session'), undefined)
})
