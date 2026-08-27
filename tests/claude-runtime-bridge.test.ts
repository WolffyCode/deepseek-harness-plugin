import assert from 'node:assert/strict'
import test from 'node:test'
import { ClaudeSessionRuntimeBridge } from '../src/agent/runtime.js'
import type { ClaudeAdapterEvent, ClaudeAgentSession } from '../src/claude/types.js'

test('ClaudeSessionRuntimeBridge does not treat a live process as already exited', async () => {
  const listeners = new Set<(event: ClaudeAdapterEvent) => void>()
  let closeCalls = 0
  const session = {
    subscribe(listener: (event: ClaudeAdapterEvent) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async close(): Promise<void> { closeCalls += 1 },
  } as unknown as ClaudeAgentSession
  const runtime = new ClaudeSessionRuntimeBridge(session)
  let exited = false
  void runtime.process.exited.then(() => { exited = true })
  await Promise.resolve()
  assert.equal(exited, false)

  for (const listener of listeners) listener({ type: 'process_exited' })
  await runtime.process.exited
  assert.equal(exited, true)
  assert.equal(closeCalls, 0)

  await runtime.close()
  assert.equal(closeCalls, 1)
})

test('ClaudeSessionRuntimeBridge resolves process lifecycle on explicit close', async () => {
  const session = {
    subscribe(): () => void { return () => {} },
    async close(): Promise<void> {},
  } as unknown as ClaudeAgentSession
  const runtime = new ClaudeSessionRuntimeBridge(session)
  const pending = runtime.process.exited
  await runtime.close()
  await pending
  await runtime.close()
})

test('ClaudeSessionRuntimeBridge does not convert provider status into a terminal error', async () => {
  const listeners = new Set<(event: ClaudeAdapterEvent) => void>()
  const session = {
    subscribe(listener: (event: ClaudeAdapterEvent) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async close(): Promise<void> {},
  } as unknown as ClaudeAgentSession
  const runtime = new ClaudeSessionRuntimeBridge(session)
  const events: unknown[] = []
  runtime.onEvent(event => events.push(event))
  for (const listener of listeners) listener({ type: 'status_changed', status: 'status' })
  await Promise.resolve()
  assert.deepEqual(events, [])
  await runtime.close()
})

test('ClaudeSessionRuntimeBridge does not duplicate final assistant text after streamed deltas', async () => {
  const listeners = new Set<(event: ClaudeAdapterEvent) => void>()
  const session = {
    subscribe(listener: (event: ClaudeAdapterEvent) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async close(): Promise<void> {},
  } as unknown as ClaudeAgentSession
  const runtime = new ClaudeSessionRuntimeBridge(session)
  const events: unknown[] = []
  runtime.onEvent(event => events.push(event))
  for (const listener of listeners) listener({ type: 'turn_started', turnId: 'turn-1' })
  for (const listener of listeners) listener({ type: 'timeline', turnId: 'turn-1', item: { type: 'assistant_message', text: 'streamed', partial: true } })
  for (const listener of listeners) listener({ type: 'timeline', turnId: 'turn-1', item: { type: 'assistant_message', text: 'streamed' } })
  for (const listener of listeners) listener({ type: 'turn_completed', turnId: 'turn-1' })
  assert.deepEqual(events, [
    { type: 'turn_started', provider: 'claude-cli', turnId: 'turn-1' },
    { type: 'timeline', provider: 'claude-cli', turnId: 'turn-1', item: { type: 'assistant_message', text: 'streamed', partial: true } },
    { type: 'turn_completed', provider: 'claude-cli', turnId: 'turn-1' },
  ])
  await runtime.close()
})
