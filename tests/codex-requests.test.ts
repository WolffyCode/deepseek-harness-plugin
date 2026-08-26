import test from 'node:test'
import assert from 'node:assert/strict'
import { createCodexServerRequestHandler } from '../src/codex/requests.js'

test('Codex approval requests use the Harness approval outcome and available decisions', async () => {
  const calls: unknown[] = []
  const handler = createCodexServerRequestHandler({
    agent: () => ({ id: 'agent' }),
    approval: {
      request: async request => {
        calls.push(request)
        return 'allowed-once'
      },
    },
  })
  assert.deepEqual(await handler('item/commandExecution/requestApproval', {
    availableDecisions: ['decline', 'accept'], reason: 'run a command',
  }), { decision: 'accept' })
  assert.deepEqual(await handler('item/fileChange/requestApproval', {
    availableDecisions: ['decline', 'cancel'],
  }), { decision: 'cancel' })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], { agent: { id: 'agent' }, toolName: 'command_execution', reason: 'run a command' })
  assert.deepEqual(calls[1], { agent: { id: 'agent' }, toolName: 'file_change' })
})

test('Codex approval requests fail closed without a Harness approval service', async () => {
  const handler = createCodexServerRequestHandler({ agent: () => undefined })
  assert.deepEqual(await handler('item/commandExecution/requestApproval', { availableDecisions: ['decline', 'cancel'] }), { decision: 'cancel' })
  assert.deepEqual(await handler('item/permissions/requestApproval', {}), { permissions: {}, scope: 'turn' })
  assert.deepEqual(await handler('item/tool/requestUserInput', {}), { answers: {} })
  assert.deepEqual(await handler('mcpServer/elicitation/request', {}), { action: 'decline', content: null, _meta: null })
})
