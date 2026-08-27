import test from 'node:test'
import assert from 'node:assert/strict'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineSuiteSelectionRequest } from '../src/types.js'
import {
  activityAriaAttributes,
  createEngineSuiteActivityStore,
  createEngineSuiteRealtimeSnapshot,
  mergeIncrementalChunks,
  mergeIncrementalText,
} from '../src/client/realtime-ui.js'

function nodeStore(entries: readonly { readonly key: string; readonly kind: string; readonly data: unknown }[]) {
  const byKey = new Map(entries.map(entry => [entry.key, {
    ...entry,
    id: entry.key,
    target: 'chat',
    anchorSeq: 1,
    location: { kind: 'unresolved' },
    visibility: 'visible',
  }]))
  return {
    get: (key: string) => byKey.get(key),
    values: () => [...byKey.values()],
  }
}

function snapshot(overrides: Record<string, unknown> = {}): ConversationSnapshot {
  const turns = new Map<number, unknown>([[1, {
    status: 'open',
    start: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
    end: undefined,
    steps: [{ turn: 1, step: 1, status: 'open', start: { type: 'step/start', seq: 2, time: 2, data: { turn: 1, step: 1 } }, end: undefined, data: { get: () => undefined } }],
    data: { get: () => undefined },
  }]])
  return {
    sessionId: 'session-1',
    views: { get: () => undefined },
    chat: {
      order: [],
      nodes: nodeStore([]),
      locations: { getTurn: () => [], getStep: () => [] },
      timeline: { turnOrder: [1], turns },
      legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] },
    },
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
    ...overrides,
  } as unknown as ConversationSnapshot
}

function withNodes(entries: readonly { readonly key: string; readonly kind: string; readonly data: unknown }[], overrides: Record<string, unknown> = {}): ConversationSnapshot {
  return snapshot({
    chat: {
      ...snapshot().chat,
      order: entries.map(entry => entry.key),
      nodes: nodeStore(entries),
    },
    ...overrides,
  })
}

const selection: EngineSuiteSelectionRequest = {
  engineId: 'codex-cli',
  providerId: 'codex-provider',
  modelRecordId: 'codex-provider/gpt-5.6-sol',
  reasoningEffort: 'xhigh',
}

test('accepted input publishes working state before the first provider event', () => {
  const model = createEngineSuiteRealtimeSnapshot(snapshot({ composerPhase: 'engaging' }), selection)
  assert.equal(model.phase, 'working')
  assert.equal(model.working, true)
  assert.equal(model.stopAvailable, true)
  assert.equal(model.events.length, 0)
  assert.match(model.ariaLabel, /正在工作/u)
})

test('thinking, tool call, and tool result remain incremental and traceable', () => {
  const model = createEngineSuiteRealtimeSnapshot(withNodes([
    {
      key: 'assistant:1:1',
      kind: 'assistant-step',
      data: {
        status: 'running', turn: 1, step: 1, time: 3,
        blocks: [{ kind: 'reasoning', text: '先检查工作区' }, { kind: 'text', text: '我正在处理。' }],
      },
    },
    {
      key: 'tool:call-1',
      kind: 'tool-call',
      data: { root: { callId: 'call-1', name: 'shell', argsRaw: '{"cmd":"pwd"}', turn: 1, step: 1, time: 4, callView: null, subCalls: [] } },
    },
  ], { running: true }), selection)
  assert.equal(model.phase, 'tool')
  assert.equal(model.stopAvailable, true)
  assert.equal(model.liveText, '我正在处理。')
  assert.deepEqual(model.events.map(item => [item.kind, item.status]), [
    ['reasoning', 'running'],
    ['assistant', 'running'],
    ['tool-call', 'running'],
  ])
  assert.equal(model.events.filter(item => item.kind === 'tool-call' && item.callId === 'call-1').length, 1)

  const settled = createEngineSuiteRealtimeSnapshot(withNodes([
    {
      key: 'tool:call-1',
      kind: 'tool-call',
      data: { root: { kind: 'tool-result', seq: 6, time: 6, callId: 'call-1', call: { name: 'shell', argsRaw: '{"cmd":"pwd"}' }, callTime: 4, content: [{ type: 'text', text: '/tmp' }], isError: false, callView: null, resultView: null, subCalls: [] } },
    },
  ], { running: true }), selection)
  assert.equal(settled.phase, 'working')
  assert.deepEqual(settled.events.map(item => [item.kind, item.status]), [
    ['tool-call', 'completed'],
    ['tool-result', 'completed'],
  ])
  assert.equal(settled.events.find(item => item.kind === 'tool-result')?.detail, '/tmp')
})

test('approval, error, and cancellation have distinct visual states', () => {
  const approval = createEngineSuiteRealtimeSnapshot(snapshot({
    running: true,
    pending: [{ kind: 'approval', key: 'approval:1', payload: { toolName: 'shell' } }],
  }), selection)
  assert.equal(approval.phase, 'approval')
  assert.equal(approval.stopAvailable, true)
  assert.equal(approval.events[0]?.kind, 'approval')

  const error = createEngineSuiteRealtimeSnapshot(snapshot({ lastAgentError: 'provider unavailable' }), selection)
  assert.equal(error.phase, 'failed')
  assert.equal(error.stopAvailable, false)
  assert.equal(error.events.at(-1)?.kind, 'error')

  const canceled = createEngineSuiteRealtimeSnapshot(withNodes([
    {
      key: 'assistant:1:1',
      kind: 'assistant-step',
      data: { status: 'interrupted', turn: 1, step: 1, time: 3, blocks: [{ kind: 'text', text: '被停止的前缀' }] },
    },
  ]), selection)
  assert.equal(canceled.phase, 'cancelled')
  assert.equal(canceled.stopAvailable, false)
  assert.equal(canceled.events.at(-1)?.kind, 'cancelled')
})

test('incremental assistant text is de-duplicated without fabricating stream timing', () => {
  assert.equal(mergeIncrementalText('', 'Hello'), 'Hello')
  assert.equal(mergeIncrementalText('Hello', 'Hello world'), 'Hello world')
  assert.equal(mergeIncrementalText('Hello', ' world'), 'Hello world')
  assert.equal(mergeIncrementalText('Hello world', 'world'), 'Hello world')
  assert.equal(mergeIncrementalChunks(['A', 'AB', 'C']), 'ABC')
})

test('activity store is session-scoped and notifies live slot consumers', () => {
  const store = createEngineSuiteActivityStore()
  const seen: string[] = []
  const off = store.subscribe('session-1', () => {
    const current = store.getSnapshot('session-1')
    if (current !== undefined) seen.push(current.phase)
  })
  const value = createEngineSuiteRealtimeSnapshot(snapshot({ composerPhase: 'engaging' }), selection)
  store.publish('session-1', value)
  assert.equal(store.getSnapshot('session-1'), value)
  assert.deepEqual(seen, ['working'])
  off()
  store.clear('session-1')
  assert.equal(store.getSnapshot('session-1'), undefined)
})

test('activity status uses a polite live region and exposes the phase as state', () => {
  assert.deepEqual(activityAriaAttributes('thinking'), {
    role: 'status',
    ariaLive: 'polite',
    dataState: 'thinking',
  })
})
