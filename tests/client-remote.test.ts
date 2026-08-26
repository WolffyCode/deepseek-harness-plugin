import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  EngineSuiteCatalogView,
  EngineSuiteCreateAgentRequest,
  EngineSuiteCreateAgentResponse,
  EngineSuiteDiscoverModelsResponse,
  EngineSuiteSwitchAgentRequest,
  EngineSuiteSwitchAgentResponse,
} from '../src/types.js'
import { createEngineSuiteCatalogController, type EngineSuiteRemoteGateway } from '../src/client/catalog.js'

const catalog: EngineSuiteCatalogView = {
  engines: [
    { id: 'claude-cli', type: 'claude-cli', displayName: 'Claude CLI', capabilities: {} as EngineSuiteCatalogView['engines'][number]['capabilities'] },
    { id: 'codex-cli', type: 'codex-cli', displayName: 'Codex CLI', capabilities: {} as EngineSuiteCatalogView['engines'][number]['capabilities'] },
  ],
  providers: [
    { id: 'glm', engineId: 'claude-cli', name: 'GLM', baseUri: 'https://glm.example', wireApi: 'anthropic', authMode: 'auth-token', enabled: true, status: 'available' },
    { id: 'codex', engineId: 'codex-cli', name: 'Codex', baseUri: 'https://codex.example', wireApi: 'responses', authMode: 'api-key', enabled: true, status: 'available' },
  ],
  models: [
    { id: 'glm/glm-5', engineId: 'claude-cli', providerId: 'glm', modelId: 'glm-5', displayName: 'GLM 5', enabled: true, hidden: false, reasoningOptions: [{ id: 'high' }], defaultReasoningEffort: 'high', inputModalities: ['text'], contextWindowSource: 'unknown', source: 'manual' },
    { id: 'codex/gpt-5', engineId: 'codex-cli', providerId: 'codex', modelId: 'gpt-5', displayName: 'GPT 5', enabled: true, hidden: false, reasoningOptions: [{ id: 'medium' }], defaultReasoningEffort: 'medium', inputModalities: ['text'], contextWindowSource: 'unknown', source: 'manual' },
  ],
  profiles: [],
  skillSets: [],
  mcpSets: [],
}

function ok<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

function err(code: string, message: string): RemoteResult<never> {
  return { ok: false, error: { code, message, details: {} } }
}

class SpyRemote implements EngineSuiteRemoteGateway {
  catalogCalls = 0
  discoverCalls: string[] = []
  created: EngineSuiteCreateAgentRequest[] = []
  switched: EngineSuiteSwitchAgentRequest[] = []

  async catalog(): Promise<RemoteResult<EngineSuiteCatalogView>> {
    this.catalogCalls += 1
    return ok(catalog)
  }

  async discoverModels(providerId: string): Promise<RemoteResult<EngineSuiteDiscoverModelsResponse>> {
    this.discoverCalls.push(providerId)
    return ok({ models: providerId === 'codex' ? [catalog.models[1]!] : [] })
  }

  async sessionCommands(): Promise<RemoteResult<import('../src/types.js').EngineSuiteCommandsResponse>> {
    return ok({ sessionId: 'session', commands: [] })
  }

  async createAgent(request: EngineSuiteCreateAgentRequest): Promise<RemoteResult<EngineSuiteCreateAgentResponse>> {
    this.created.push(request)
    return ok({ sessionId: request.sessionId, agentId: 'agent-1', profileId: 'profile-1' })
  }

  async switchAgent(request: EngineSuiteSwitchAgentRequest): Promise<RemoteResult<EngineSuiteSwitchAgentResponse>> {
    this.switched.push(request)
    return ok({ sessionId: request.sessionId, agentId: 'agent-2', profileId: 'profile-2' })
  }
}

test('client catalog controller spies every Host Remote seam and deduplicates refresh', async () => {
  const remote = new SpyRemote()
  const controller = createEngineSuiteCatalogController(remote)
  const first = controller.refresh()
  const second = controller.refresh()
  assert.strictEqual(first, second)
  assert.deepEqual(await first, catalog)
  assert.equal(remote.catalogCalls, 1)

  const discovered = await controller.discoverModels('codex')
  assert.deepEqual(discovered, [catalog.models[1]])
  assert.deepEqual(remote.discoverCalls, ['codex'])
  assert.deepEqual(controller.getSnapshot().catalog?.models, catalog.models)

  const createRequest: EngineSuiteCreateAgentRequest = {
    sessionId: 'session-1',
    selection: { engineId: 'claude-cli', providerId: 'glm', modelRecordId: 'glm/glm-5', reasoningEffort: 'high' },
    cwd: '/tmp/project',
  }
  const switchRequest: EngineSuiteSwitchAgentRequest = {
    sessionId: 'session-1',
    selection: { engineId: 'claude-cli', providerId: 'glm', modelRecordId: 'glm/glm-5', reasoningEffort: 'medium' },
  }
  assert.deepEqual(await controller.createAgent(createRequest), { sessionId: 'session-1', agentId: 'agent-1', profileId: 'profile-1' })
  assert.deepEqual(await controller.switchAgent(switchRequest), { sessionId: 'session-1', agentId: 'agent-2', profileId: 'profile-2' })
  assert.deepEqual(remote.created, [createRequest])
  assert.deepEqual(remote.switched, [switchRequest])
})

test('client catalog controller preserves Remote error codes at the client seam', async () => {
  const remote: EngineSuiteRemoteGateway = {
    catalog: async () => err('catalog-unavailable', 'catalog is unavailable'),
    discoverModels: async () => err('discover-failed', 'discovery failed'),
    createAgent: async () => err('create-failed', 'creation failed'),
    sessionCommands: async () => ({ ok: true as const, value: { sessionId: 'session', commands: [] } }),
    switchAgent: async () => err('switch-failed', 'switch failed'),
  }
  const controller = createEngineSuiteCatalogController(remote)
  await assert.rejects(controller.refresh(), /catalog-unavailable: catalog is unavailable/u)
  await assert.rejects(controller.discoverModels('glm'), /discover-failed: discovery failed/u)
  await assert.rejects(controller.createAgent({ sessionId: 's', selection: { engineId: 'claude-cli', providerId: 'glm', modelRecordId: 'glm/glm-5' }, cwd: '/tmp' }), /create-failed: creation failed/u)
  await assert.rejects(controller.switchAgent({ sessionId: 's', selection: { engineId: 'claude-cli', providerId: 'glm', modelRecordId: 'glm/glm-5' } }), /switch-failed: switch failed/u)
})
