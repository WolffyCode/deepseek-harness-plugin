import test from 'node:test'
import assert from 'node:assert/strict'
import type { EngineSuiteRemoteGateway } from '../src/client/catalog.js'
import type { EngineSuiteCommandView, EngineSuiteCommandsResponse } from '../src/types.js'
import { createEngineSuiteCatalogController } from '../src/client/catalog.js'

test('client command catalog refreshes the active Session and preserves Remote errors', async () => {
  const commands: readonly EngineSuiteCommandView[] = [{ name: 'review', description: 'Review', argumentHint: '<scope>', source: 'skill' }]
  const requests: Array<{ sessionId: string; refresh: boolean }> = []
  let fail = false
  const remote: EngineSuiteRemoteGateway = {
    catalog: async () => ({ ok: true, value: { engines: [], providers: [], models: [], profiles: [], skillSets: [], mcpSets: [] } }),
    discoverModels: async () => ({ ok: true, value: { models: [] } }),
    createAgent: async request => ({ ok: true, value: { sessionId: request.sessionId, agentId: 'agent', profileId: 'profile' } }),
    switchAgent: async request => ({ ok: true, value: { sessionId: request.sessionId, agentId: 'agent', profileId: 'profile' } }),
    sessionCommands: async (sessionId, refresh): Promise<{ ok: true; value: EngineSuiteCommandsResponse } | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }> => {
      requests.push({ sessionId, refresh })
      if (fail) return { ok: false, error: { code: 'session-closed', message: 'session is closed', details: {} } }
      return { ok: true, value: { sessionId, commands } }
    },
  }
  const controller = createEngineSuiteCatalogController(remote)
  assert.deepEqual(await controller.listCommands('session-1', true), commands)
  assert.deepEqual(requests, [{ sessionId: 'session-1', refresh: true }])
  fail = true
  await assert.rejects(controller.listCommands('session-1', true), /session-closed: session is closed/u)
})
