import assert from 'node:assert/strict'
import test from 'node:test'
import type { SDKMessage, Query } from '@anthropic-ai/claude-agent-sdk'
import { claudeUserAgentDefinitionsBrand, createClaudeProviderSession, createClaudeUserAgentDefinitions, type ClaudeQueryFactoryInput, type ClaudeUserAgentDefinitions } from '../src/claude/adapter.js'
import { parseClaudeUserAgentDefinitions } from '../src/claude/session.js'
import type { ClaudeAdapterEvent } from '../src/claude/types.js'

class FakeQuery implements AsyncGenerator<SDKMessage, void> {
  readonly options: ClaudeQueryFactoryInput['options']
  returnCalls = 0
  private readonly messages: SDKMessage[] = []
  private readonly waiters: Array<{
    readonly resolve: (result: IteratorResult<SDKMessage, void>) => void
    readonly reject: (error: Error) => void
  }> = []
  private closed = false
  private failure: Error | undefined

  constructor(options: ClaudeQueryFactoryInput['options']) {
    this.options = options
  }

  push(message: SDKMessage): void {
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      waiter.resolve({ value: message, done: false })
      return
    }
    this.messages.push(message)
  }

  fail(error: Error): void {
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      waiter.reject(error)
      return
    }
    this.failure = error
  }

  async next(): Promise<IteratorResult<SDKMessage, void>> {
    const message = this.messages.shift()
    if (message !== undefined) return { value: message, done: false }
    if (this.failure !== undefined) {
      const error = this.failure
      this.failure = undefined
      throw error
    }
    if (this.closed) return { value: undefined, done: true }
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  async return(): Promise<IteratorResult<SDKMessage, void>> {
    this.returnCalls += 1
    this.closed = true
    while (this.waiters.length > 0) this.waiters.shift()?.resolve({ value: undefined, done: true })
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

test('Claude final SDK options contain no Harness prompt, tool schema, or custom agents', async () => {
  let query: FakeQuery | undefined
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    model: 'claude-sonnet',
    queryFactory: ({ options }): Query => {
      query = new FakeQuery(options)
      return query as unknown as Query
    },
  })

  try {
    assert.ok(query !== undefined)
    const options: Record<string, unknown> = query.options
    for (const forbidden of ['systemPrompt', 'appendSystemPrompt', 'tools', 'agents']) {
      assert.equal(Object.hasOwn(options, forbidden), false, `forbidden SDK option leaked: ${forbidden}`)
    }

    query.push(initMessage())
    await session.whenReady?.()
    const resultPromise = session.run('hello')
    await new Promise<void>(resolve => setImmediate(resolve))
    query.push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'ok',
      session_id: 'fake-session',
    } as unknown as SDKMessage)
    await resultPromise
  } finally {
    await session.close()
  }
})

test('Harness or cross-engine agent maps are rejected at the Claude boundary before any query exists', () => {
  const harnessAgentMap = {
    injected: {
      description: 'must not cross the Claude boundary',
      prompt: 'must not become an SDK subagent prompt',
    },
  }
  assert.throws(() => parseClaudeUserAgentDefinitions(harnessAgentMap), /Claude agents input is rejected.*Harness or cross-engine agent maps/s)
})

test('Explicit user Claude agent definitions pass the boundary only in the opt-in wrapper', async () => {
  let query: FakeQuery | undefined
  const userAgents: ClaudeUserAgentDefinitions = createClaudeUserAgentDefinitions({
    reviewer: { description: 'Reviews diffs', prompt: 'You are a reviewer.', tools: ['Read'] },
  })
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    model: 'claude-sonnet',
    agents: userAgents,
    queryFactory: ({ options }): Query => {
      query = new FakeQuery(options)
      return query as unknown as Query
    },
  })

  try {
    assert.ok(query !== undefined)
    const options: Record<string, unknown> = query.options
    assert.deepEqual(options['agents'], { reviewer: { description: 'Reviews diffs', prompt: 'You are a reviewer.', tools: ['Read'] } })
    for (const forbidden of ['systemPrompt', 'appendSystemPrompt', 'tools']) {
      assert.equal(Object.hasOwn(options, forbidden), false, `forbidden SDK option leaked: ${forbidden}`)
    }
    await session.close()
    assert.equal(query.returnCalls, 1)
  } finally {
    await session.close()
  }
})

test('Unbranded malformed Claude agent definitions are rejected at the boundary', () => {
  const malformed = {
    source: 'user',
    definitions: { broken: { description: 'missing prompt' } },
    [claudeUserAgentDefinitionsBrand]: true,
  }
  const malformedUnknown: unknown = malformed
  assert.throws(() => parseClaudeUserAgentDefinitions(malformedUnknown), /Claude user agent definition 'broken' requires string 'description' and 'prompt'/)
})

test('Claude SDK failures redact credentials from thrown errors and error events', async () => {
  const secret = 'claude-secret-not-for-logs'
  let query: FakeQuery | undefined
  const events: ClaudeAdapterEvent[] = []
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    authToken: secret,
    queryFactory: ({ options }): Query => {
      query = new FakeQuery(options)
      return query as unknown as Query
    },
  })
  session.subscribe(event => events.push(event))

  try {
    await session.whenReady?.()
    const resultPromise = session.run('cause a transport failure')
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(query !== undefined)
    const token = query.options.env?.['ANTHROPIC_AUTH_TOKEN']
    assert.equal(token, secret)
    query.fail(new Error(`SDK stderr echoed ${token}`))

    await assert.rejects(resultPromise, error => {
      assert.ok(error instanceof Error)
      assert.equal(error.message.includes(secret), false)
      return true
    })
    const processExited = events.find((event): event is Extract<ClaudeAdapterEvent, { type: 'process_exited' }> => event.type === 'process_exited')
    assert.ok(processExited !== undefined)
    assert.equal(processExited.error?.includes(secret), false)
    assert.equal(JSON.stringify(events).includes(secret), false)
  } finally {
    await session.close()
  }
})
