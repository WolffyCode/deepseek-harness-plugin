import assert from 'node:assert/strict'
import test from 'node:test'
import type { SDKMessage, Query } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeSdkTransport } from '../src/claude/transport.js'
import type { ClaudeInputMessage, ClaudeQueryFactoryInput } from '../src/claude/types.js'

class FakeQuery implements AsyncGenerator<SDKMessage, void> {
  readonly options: ClaudeQueryFactoryInput['options']
  private readonly messages: SDKMessage[] = []
  private readonly waiters: Array<(result: IteratorResult<SDKMessage>) => void> = []
  private done = false
  private interrupted = false

  constructor(options: ClaudeQueryFactoryInput['options']) { this.options = options }

  push(message: SDKMessage): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: message, done: false })
    else this.messages.push(message)
  }

  async next(): Promise<IteratorResult<SDKMessage>> {
    if (this.messages.length) return { value: this.messages.shift()!, done: false }
    if (this.done) return { value: undefined as never, done: true }
    return new Promise(resolve => this.waiters.push(resolve))
  }

  async return(): Promise<IteratorResult<SDKMessage>> {
    this.done = true
    while (this.waiters.length) this.waiters.shift()!({ value: undefined as never, done: true })
    return { value: undefined as never, done: true }
  }

  async throw(error?: unknown): Promise<IteratorResult<SDKMessage>> {
    this.done = true
    throw error
  }

  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> { return this }
  async interrupt(): Promise<void> { this.interrupted = true }
  wasInterrupted(): boolean { return this.interrupted }
}

function waitFor<T>(predicate: () => T | undefined, timeout = 1_000): Promise<T> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const value = predicate()
      if (value !== undefined) { resolve(value); return }
      if (Date.now() - started > timeout) { reject(new Error('timed out')); return }
      setTimeout(tick, 1)
    }
    tick()
  })
}

const initMessage = {
  type: 'system', subtype: 'init', session_id: 'session-1', model: 'claude-sonnet', permissionMode: 'default',
  slash_commands: ['/help'], skills: ['review'], mcp_servers: [], capabilities: ['interrupt_receipt_v1'],
} as unknown as SDKMessage

test('ClaudeSdkTransport subscribes before start and preserves early SDK messages', async () => {
  let query!: FakeQuery
  let input!: AsyncIterable<ClaudeInputMessage>
  const factory = ({ prompt, options }: ClaudeQueryFactoryInput): Query => {
    input = prompt
    query = new FakeQuery(options)
    return query as unknown as Query
  }
  const transport = new ClaudeSdkTransport({ cwd: process.cwd(), includePartialMessages: true }, factory)
  const events: string[] = []
  const unsubscribe = transport.subscribe(event => {
    if (event.type === 'message') events.push(String((event.message as { type: string }).type))
  })
  transport.send({ type: 'user', message: { role: 'user', content: 'hello' }, parent_tool_use_id: null })
  const iterator = input[Symbol.asyncIterator]()
  assert.deepEqual((await iterator.next()).value?.message.content, 'hello')
  query.push(initMessage)
  query.push({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 'session-1' } as unknown as SDKMessage)
  await waitFor(() => events.length === 2 ? events : undefined)
  assert.deepEqual(events, ['system', 'result'])
  await transport.interrupt()
  assert.equal(query.wasInterrupted(), true)
  unsubscribe()
  await transport.close()
})

test('ClaudeSdkTransport closes the SDK query and reports transport errors', async () => {
  let query!: FakeQuery
  const transport = new ClaudeSdkTransport({ cwd: process.cwd() }, ({ options }) => {
    query = new FakeQuery(options)
    return query as unknown as Query
  })
  const events: Array<{ type: string; error?: Error }> = []
  transport.subscribe(event => events.push(event))
  query.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 's' } as unknown as SDKMessage)
  await waitFor(() => events.length ? events : undefined)
  await transport.close()
  assert.equal(events[0]?.type, 'message')
})
