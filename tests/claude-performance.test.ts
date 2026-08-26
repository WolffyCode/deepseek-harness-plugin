import assert from 'node:assert/strict'
import test from 'node:test'
import type { SDKMessage, Query } from '@anthropic-ai/claude-agent-sdk'
import { createClaudeProviderSession, type ClaudeQueryFactoryInput } from '../src/claude/adapter.js'
import type { ClaudeAdapterEvent } from '../src/claude/types.js'

class FakeQuery implements AsyncGenerator<SDKMessage, void> {
  readonly options: ClaudeQueryFactoryInput['options']
  returnCalls = 0
  private readonly messages: SDKMessage[] = []
  private readonly waiters: Array<(result: IteratorResult<SDKMessage, void>) => void> = []
  private closed = false

  constructor(options: ClaudeQueryFactoryInput['options']) {
    this.options = options
  }

  push(message: SDKMessage): void {
    const waiter = this.waiters.shift()
    if (waiter !== undefined) waiter({ value: message, done: false })
    else this.messages.push(message)
  }

  async next(): Promise<IteratorResult<SDKMessage, void>> {
    const message = this.messages.shift()
    if (message !== undefined) return { value: message, done: false }
    if (this.closed) return { value: undefined, done: true }
    return new Promise(resolve => this.waiters.push(resolve))
  }

  async return(): Promise<IteratorResult<SDKMessage, void>> {
    this.returnCalls += 1
    this.closed = true
    while (this.waiters.length > 0) this.waiters.shift()?.({ value: undefined, done: true })
    return { value: undefined, done: true }
  }

  async throw(error?: Error): Promise<IteratorResult<SDKMessage, void>> {
    this.closed = true
    throw error ?? new Error('fake query throw')
  }

  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> {
    return this
  }

  async interrupt(): Promise<void> {
    await this.return()
  }

  async setModel(): Promise<void> {}
  async setPermissionMode(): Promise<void> {}
  async setMaxThinkingTokens(): Promise<void> {}
  async initializationResult(): Promise<Record<string, never>> { return {} }
  async supportedCommands(): Promise<readonly never[]> { return [] }
  async supportedModels(): Promise<readonly never[]> { return [] }
  async mcpServerStatus(): Promise<readonly never[]> { return [] }
}

function initMessage(): SDKMessage {
  return {
    type: 'system',
    subtype: 'init',
    session_id: 'fake-session',
    model: 'claude-sonnet',
    permissionMode: 'default',
    slash_commands: [],
    skills: [],
    mcp_servers: [],
    capabilities: [],
  } as unknown as SDKMessage
}

function textChunk(index: number): SDKMessage {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: `chunk-${index.toString().padStart(5, '0')}` },
    },
  } as unknown as SDKMessage
}

function timelineText(event: ClaudeAdapterEvent): string | undefined {
  if (event.type !== 'timeline' || event.item.type !== 'assistant_message') return undefined
  return event.item.text
}

test('Claude stream preserves 10,000 fake SDK chunks in order', async () => {
  const chunks = 10_000
  let query: FakeQuery | undefined
  const events: ClaudeAdapterEvent[] = []
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    model: 'claude-sonnet',
    queryFactory: ({ options }): Query => {
      query = new FakeQuery(options)
      return query as unknown as Query
    },
  })
  session.subscribe(event => events.push(event))

  const resultPromise = session.run('stream 10,000 chunks')
  assert.ok(query !== undefined)
  query.push(initMessage())
  for (let index = 0; index < chunks; index += 1) query.push(textChunk(index))
  query.push({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'complete',
    session_id: 'fake-session',
  } as unknown as SDKMessage)

  const result = await resultPromise
  const received = events.flatMap(event => {
    const text = timelineText(event)
    return text === undefined ? [] : [text]
  })
  const expected = Array.from({ length: chunks }, (_, index) => `chunk-${index.toString().padStart(5, '0')}`)
  assert.equal(received.length, chunks)
  assert.equal(received[0], expected[0])
  assert.equal(received.at(-1), expected.at(-1))
  assert.deepEqual(received, expected)
  assert.equal(result.finalText, expected.join(''))
  await session.close()
})

test('20 fake Claude sessions close idempotently and release each query once', async () => {
  const queries: FakeQuery[] = []
  const sessions = Array.from({ length: 20 }, () => createClaudeProviderSession({
    cwd: process.cwd(),
    queryFactory: ({ options }): Query => {
      const query = new FakeQuery(options)
      queries.push(query)
      return query as unknown as Query
    },
  }))

  await Promise.all(sessions.flatMap(session => [session.close(), session.close()]))
  assert.equal(queries.length, 20)
  assert.deepEqual(queries.map(query => query.returnCalls), Array.from({ length: 20 }, () => 1))
  await Promise.all(sessions.map(session => session.close()))
  assert.deepEqual(queries.map(query => query.returnCalls), Array.from({ length: 20 }, () => 1))
})
