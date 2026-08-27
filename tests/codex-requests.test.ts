import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CodexApprovalUnavailableError,
  CodexUnsupportedServerRequestError,
  createCodexServerRequestHandler,
} from '../src/codex/requests.js'

function approval(outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable', calls: unknown[] = []) {
  return {
    request: async (request: unknown) => {
      calls.push(request)
      return outcome
    },
  }
}

test('command approval maps allow to the V2 accept decision and preserves request context locally', async () => {
  const calls: unknown[] = []
  const handler = createCodexServerRequestHandler({
    agent: () => ({ id: 'agent' }),
    approval: approval('allowed-once', calls),
  })

  assert.deepEqual(await handler('item/commandExecution/requestApproval', {
    requestId: 'rpc-1',
    itemId: 'item-1',
    threadId: 'thread-1',
    turnId: 'turn-1',
    availableDecisions: ['decline', 'accept'],
    reason: 'run a command',
    command: 'printf safe',
    cwd: '/workspace',
    kind: 'command',
    commandActions: [{ type: 'run' }],
    secret: 'must-not-be-echoed',
  }), { decision: 'accept' })
  assert.deepEqual(calls, [{
    agent: { id: 'agent' },
    toolName: 'command_execution',
    requestId: 'rpc-1',
    itemId: 'item-1',
    callId: 'item-1',
    threadId: 'thread-1',
    turnId: 'turn-1',
    reason: 'run a command',
    context: {
      command: 'printf safe',
      cwd: '/workspace',
      kind: 'command',
      commandActions: [{ type: 'run' }],
    },
  }])
})

test('file approval maps allow to acceptForSession and preserves file context', async () => {
  const calls: unknown[] = []
  const handler = createCodexServerRequestHandler({
    agent: () => ({ id: 'agent' }),
    approval: approval('allowed-once', calls),
  })

  assert.deepEqual(await handler('item/fileChange/requestApproval', {
    itemId: 'file-item-1',
    threadId: 'thread-1',
    turnId: 'turn-1',
    availableDecisions: ['decline', 'acceptForSession'],
    reason: 'apply the requested edit',
    grantRoot: '/workspace',
    fileChanges: { '/workspace/a.ts': { kind: 'update' } },
  }), { decision: 'acceptForSession' })
  assert.deepEqual(calls, [{
    agent: { id: 'agent' },
    toolName: 'file_change',
    itemId: 'file-item-1',
    callId: 'file-item-1',
    threadId: 'thread-1',
    turnId: 'turn-1',
    reason: 'apply the requested edit',
    context: {
      grantRoot: '/workspace',
      fileChanges: { '/workspace/a.ts': { kind: 'update' } },
    },
  }])
})

test('decline and cancelled outcomes remain distinct V2 decisions', async () => {
  const declined = createCodexServerRequestHandler({ agent: () => ({ id: 'agent' }), approval: approval('rejected') })
  const cancelled = createCodexServerRequestHandler({ agent: () => ({ id: 'agent' }), approval: approval('cancelled') })

  assert.deepEqual(await declined('item/commandExecution/requestApproval', {
    availableDecisions: ['accept', 'decline', 'cancel'],
  }), { decision: 'decline' })
  assert.deepEqual(await cancelled('item/fileChange/requestApproval', {
    availableDecisions: ['accept', 'decline', 'cancel'],
  }), { decision: 'cancel' })
})

test('an allowed outcome never fabricates accept when the server does not offer it', async () => {
  const handler = createCodexServerRequestHandler({
    agent: () => ({ id: 'agent' }),
    approval: approval('allowed-once'),
  })

  assert.deepEqual(await handler('item/commandExecution/requestApproval', {
    availableDecisions: ['decline', 'cancel'],
  }), { decision: 'decline' })
})

test('unavailable approval is an explicit local error and never a successful approval', async () => {
  const unavailableOutcome = createCodexServerRequestHandler({
    agent: () => ({ id: 'agent' }),
    approval: approval('unavailable'),
  })
  const noService = createCodexServerRequestHandler({ agent: () => ({ id: 'agent' }) })

  await assert.rejects(
    async () => await unavailableOutcome('item/commandExecution/requestApproval', {
      itemId: 'item-unavailable',
      threadId: 'thread-1',
      turnId: 'turn-1',
    }),
    (error: unknown) => error instanceof CodexApprovalUnavailableError
      && error.code === 'CODEX_APPROVAL_UNAVAILABLE'
      && error.itemId === 'item-unavailable'
      && error.message.includes('unavailable'),
  )
  await assert.rejects(
    async () => await noService('item/fileChange/requestApproval', { itemId: 'file-unavailable' }),
    CodexApprovalUnavailableError,
  )
})

test('approval service errors retain their local error message', async () => {
  const serviceError = new Error('approval backend rejected the request')
  const handler = createCodexServerRequestHandler({
    agent: () => ({ id: 'agent' }),
    approval: {
      request: async () => { throw serviceError },
    },
  })

  await assert.rejects(
    async () => await handler('item/commandExecution/requestApproval', { itemId: 'item-error', reason: 'needs approval' }),
    (error: unknown) => error === serviceError && error instanceof Error && error.message === 'approval backend rejected the request',
  )
})

test('V2 non-approval server requests use their actual response shapes', async () => {
  const handler = createCodexServerRequestHandler({ agent: () => undefined })

  assert.deepEqual(await handler('item/permissions/requestApproval', {
    itemId: 'permission-item', threadId: 'thread-1', turnId: 'turn-1',
  }), { permissions: {}, scope: 'turn' })
  assert.deepEqual(await handler('item/tool/requestUserInput', {
    itemId: 'input-item', threadId: 'thread-1', turnId: 'turn-1',
    isBlocking: true, questions: [],
  }), { answers: {} })
  assert.deepEqual(await handler('mcpServer/elicitation/request', {
    threadId: 'thread-1', turnId: null, serverName: 'example', mode: 'url',
  }), { action: 'decline', content: null, _meta: null })
})

test('unknown server requests fail explicitly', async () => {
  const handler = createCodexServerRequestHandler({ agent: () => undefined })

  await assert.rejects(
    async () => await handler('item/unknown/request', {}),
    (error: unknown) => error instanceof CodexUnsupportedServerRequestError
      && error.code === 'CODEX_UNSUPPORTED_SERVER_REQUEST'
      && error.message.includes('item/unknown/request'),
  )
})
