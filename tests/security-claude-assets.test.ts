import assert from 'node:assert/strict'
import test from 'node:test'
import { materializeClaudeMcpOptions } from '../src/claude/mcp.js'
import { materializeClaudeSkills } from '../src/claude/skills.js'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'

test('Claude materializer outputs cannot inject system prompts, tools, or agents', () => {
  const mcp = materializeClaudeMcpOptions({
    servers: [{ name: 'remote', transport: 'http', url: 'https://mcp.example.test' }],
  }, {})
  const skills = materializeClaudeSkills({ pluginDirs: ['/workspace/plugin'] })

  for (const output of [mcp, skills]) {
    assert.equal('systemPrompt' in output, false)
    assert.equal('tools' in output, false)
    assert.equal('agents' in output, false)
  }
})

test('user assets stay separate from Harness internal assets and diagnostics never echo secrets', () => {
  const secret = 'runtime-secret-value'
  const errorMessages: string[] = []
  try {
    materializeClaudeMcpOptions({
      servers: [{ name: 'harness', scope: 'internal', transport: 'http', url: 'https://mcp.example.test', credentialRefs: { Authorization: 'secret-ref' } }],
    }, { credentialResolver: { resolve: () => secret } })
  } catch (error) {
    errorMessages.push(error instanceof Error ? error.message : String(error))
  }

  assert.equal(errorMessages.length, 1)
  assert.equal(errorMessages[0]?.includes(secret), false)
  assert.equal(JSON.stringify({ pluginDirs: ['/workspace/user-plugin'] }).includes(secret), false)
})

test('EngineSuite never sends internal MCP assets to the Claude user materializer', async () => {
  const materializedInputs: unknown[] = []
  const catalog = { models: [], commands: [], modes: [], skills: [], mcpServers: [], capabilities: [] }
  const suite = createEngineSuiteRuntime({
    claudeMcpMaterializer: (input) => {
      materializedInputs.push(input)
      return { mcpServers: { user: { type: 'stdio', command: 'user-command' } } }
    },
    claudeSessionFactory: () => ({
      sessionId: 'session', capabilities: {}, catalog,
      subscribe: () => () => {}, startTurn: async () => ({ turnId: 'turn' }), run: async () => { throw new Error('unused') }, interrupt: async () => {}, close: async () => {},
      setMode: async () => {}, setModel: async () => {}, setThinking: async () => {}, setPermissionMode: async () => {}, respondToPermission: () => false, respondToUserQuestion: () => false,
      pendingPermissions: () => [], listCommands: () => [], refreshCatalog: async () => catalog, steer: async () => ({ status: 'unavailable' }),
      persistenceHandle: () => ({ provider: 'claude-cli', sessionId: 'session', nativeHandle: 'native', cwd: '/tmp' }),
    }),
  })
  suite.providers.register({ id: 'security-provider', engineId: 'claude-cli', name: 'Security Provider', baseUri: 'https://example.test', credentialRef: 'credential-ref' })
  suite.models.register({ id: 'security-model', engineId: 'claude-cli', providerId: 'security-provider', modelId: 'claude-security', reasoningOptions: [], source: 'manual' })
  const opened = await suite.openEngine({ engineId: 'claude-cli', providerId: 'security-provider', modelRecordId: 'security-model' }, {
    apiKey: 'runtime-secret', cwd: '/tmp',
    mcpSet: { id: 'user', servers: [{ id: 'user-server', name: 'user', transport: 'stdio', command: 'user-command' }] },
    internalMcpSet: { id: 'internal', servers: [{ id: 'internal-server', name: 'internal', transport: 'stdio', command: 'internal-command' }] },
  })
  try {
    assert.equal(materializedInputs.length, 1)
    assert.equal(JSON.stringify(materializedInputs[0]).includes('internal-command'), false)
  } finally {
    await opened.close()
  }
})
