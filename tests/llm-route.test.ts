import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'
import { ExternalEngineLlmRouteRegistration } from '../src/llm-route.js'

test('external Engine routes expose the configured reasoning capability to Harness validation', async () => {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  const llm = ctx.get('llm')
  assert.ok(llm !== undefined)
  const suite = createEngineSuiteRuntime()
  suite.providers.register({
    id: 'route-provider',
    engineId: 'claude-cli',
    name: 'Route Provider',
    baseUri: 'https://example.test',
    credentialRef: 'route-credential',
    wireApi: 'anthropic',
    authMode: 'auth-token',
  })
  suite.models.register({
    id: 'route-model',
    engineId: 'claude-cli',
    providerId: 'route-provider',
    modelId: 'glm-5.3',
    reasoningOptions: [{ id: 'high' }, { id: 'max', description: 'maximum' }],
    defaultReasoningEffort: 'max',
    source: 'manual',
  })
  const registration = new ExternalEngineLlmRouteRegistration(llm, suite)
  registration.sync()
  try {
    const info = await llm.resolveModelInfo('route-provider', 'glm-5.3')
    assert.deepEqual(info.reasoning, {
      efforts: [
        { id: 'high', name: 'high' },
        { id: 'max', name: 'max', description: 'maximum' },
      ],
      defaultEffort: 'max',
    })
    assert.deepEqual(
      await llm.resolveCallConfig({ provider: 'route-provider', model: 'glm-5.3', reasoningEffort: ReasoningEffortId('max') }),
      { provider: 'route-provider', model: 'glm-5.3', reasoningEffort: 'max' },
    )
  } finally {
    registration.dispose()
    await ctx.fiber.dispose()
  }
})
