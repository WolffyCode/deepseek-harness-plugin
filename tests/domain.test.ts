import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import test from 'node:test'
import { createEngineSuite, readDebugCodexProviderSeed } from '../src/index.js'

test('resolves a Codex EngineProfile from engine/provider/model/reasoning selection', () => {
  const suite = createEngineSuite()
  suite.providers.register({
    id: 'debug-provider',
    engineId: 'codex-cli',
    name: 'Debug Provider',
    baseUri: 'https://example.test',
    credentialRef: 'credential-debug',
  })
  suite.models.register({
    id: 'debug-model',
    engineId: 'codex-cli',
    providerId: 'debug-provider',
    modelId: 'gpt-test',
    reasoningOptions: [{ id: 'medium' }, { id: 'high' }],
    defaultReasoningEffort: 'medium',
    contextWindowTokens: 1_000_000,
    contextWindowSource: 'manual',
    source: 'manual',
  })

  const profile = suite.resolveProfile({
    engineId: 'codex-cli',
    providerId: 'debug-provider',
    modelRecordId: 'debug-model',
    reasoningEffort: 'high',
  })

  assert.equal(profile.engineId, 'codex-cli')
  assert.equal(profile.providerId, 'debug-provider')
  assert.equal(profile.modelId, 'gpt-test')
  assert.equal(profile.reasoningEffort, 'high')
  assert.equal(profile.contextWindowTokens, 1_000_000)
  assert.equal(profile.snapshot, true)
})

test('rejects a model selected from a different provider', () => {
  const suite = createEngineSuite()
  suite.providers.register({
    id: 'provider-a',
    engineId: 'codex-cli',
    name: 'Provider A',
    baseUri: 'https://example.test',
    credentialRef: 'credential-a',
  })
  suite.providers.register({
    id: 'provider-b',
    engineId: 'codex-cli',
    name: 'Provider B',
    baseUri: 'https://example.test',
    credentialRef: 'credential-b',
  })
  suite.models.register({
    id: 'model-a',
    engineId: 'codex-cli',
    providerId: 'provider-a',
    modelId: 'model-a',
    source: 'manual',
  })

  assert.throws(
    () => suite.resolveProfile({
      engineId: 'codex-cli',
      providerId: 'provider-b',
      modelRecordId: 'model-a',
    }),
    /does not belong to provider provider-b/,
  )
})

test('reads the debug provider only from environment values', () => {
  const seed = readDebugCodexProviderSeed({
    DSH_DEBUG_CODEX_BASE_URI: 'https://sub2api.opencodebay.com/',
    DSH_DEBUG_CODEX_API_KEY: 'secret-for-test',
  })
  assert.equal(seed?.provider.baseUri, 'https://sub2api.opencodebay.com')
  assert.equal(seed?.provider.credentialRef, 'debug-sub2api-codex')
  assert.equal(seed?.apiKey, 'secret-for-test')
  assert.equal(readDebugCodexProviderSeed({}), undefined)
})

test('bundle entry publishes one EngineSuite service', async () => {
  const { apply } = await import('../src/plugin.js')
  const ctx = new Context()
  apply(ctx)
  const providedValue = ctx.get('engineSuite')
  assert.ok(providedValue !== undefined)
})
