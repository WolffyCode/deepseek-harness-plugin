import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClaudeAgentSession, ClaudeAdapterOptions, ClaudeCatalog } from '../src/claude/types.js'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'

function discoverySession(catalog: ClaudeCatalog, calls: string[]): ClaudeAgentSession {
  return {
    sessionId: undefined,
    capabilities: {},
    catalog,
    refreshCatalog: async () => { calls.push('refresh'); return catalog },
    close: async () => { calls.push('close') },
  } as unknown as ClaudeAgentSession
}

test('Claude model discovery uses the native catalog, keeps GLM models, and preserves advertised effort', async () => {
  const calls: string[] = []
  const created: ClaudeAdapterOptions[] = []
  const catalog: ClaudeCatalog = {
    models: [
      {
        id: 'glm-alias',
        value: 'glm-5.3',
        resolvedModel: 'glm-5.3',
        label: 'GLM 5.3',
        description: 'GLM model',
        contextWindow: 1_000_000,
        supportsEffort: true,
        supportedEffortLevels: ['low', 'medium', 'high', 'max'],
      },
      { id: 'claude-opus-4', value: 'claude-opus-4', label: 'Claude Opus 4' },
      { id: 'claude-sonnet', value: 'claude-sonnet', label: 'Claude Sonnet' },
    ],
    commands: [],
    modes: [],
    skills: [],
    mcpServers: [],
    capabilities: [],
  }
  const suite = createEngineSuiteRuntime({
    claudeSessionFactory: (options: ClaudeAdapterOptions) => {
      created.push(options)
      return discoverySession(catalog, calls)
    },
  })
  suite.providers.register({
    id: 'glm-provider',
    engineId: 'claude-cli',
    name: 'GLM',
    baseUri: 'https://provider.example',
    credentialRef: 'glm-key',
  })

  const discovered = await suite.discoverClaudeModels('glm-provider', {
    apiKey: 'secret',
    cwd: '/workspace',
    executable: '/usr/local/bin/claude',
    args: ['--bare'],
  })

  assert.deepEqual(calls, ['refresh', 'close'])
  assert.deepEqual(created[0], {
    cwd: '/workspace',
    baseUri: 'https://provider.example',
    authToken: 'secret',
    persistSession: false,
    executablePath: '/usr/local/bin/claude',
    commandArgs: ['--bare'],
  })
  assert.deepEqual(discovered.map(model => ({
    id: model.id,
    modelId: model.modelId,
    displayName: model.displayName,
    reasoningOptions: model.reasoningOptions,
    contextWindowTokens: model.contextWindowTokens,
    contextWindowSource: model.contextWindowSource,
    source: model.source,
  })), [{
    id: 'glm-provider/glm-5.3',
    modelId: 'glm-5.3',
    displayName: 'GLM 5.3',
    reasoningOptions: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'max' }],
    contextWindowTokens: 1_000_000,
    contextWindowSource: 'discovered',
    source: 'discovered',
  }])
})

test('Claude model discovery rejects non-Claude providers and empty credentials', async () => {
  const suite = createEngineSuiteRuntime()
  suite.providers.register({
    id: 'codex-provider',
    engineId: 'codex-cli',
    name: 'Codex',
    baseUri: 'https://provider.example',
    credentialRef: 'codex-key',
  })
  await assert.rejects(
    () => suite.discoverClaudeModels('codex-provider', { apiKey: 'secret', cwd: '/tmp' }),
    /not a Claude provider/u,
  )

  suite.providers.register({
    id: 'claude-provider',
    engineId: 'claude-cli',
    name: 'Claude',
    baseUri: 'https://provider.example',
    credentialRef: 'claude-key',
  })
  await assert.rejects(
    () => suite.discoverClaudeModels('claude-provider', { apiKey: '  ', cwd: '/tmp' }),
    /Claude API key must not be empty/u,
  )
})
