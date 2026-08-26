import assert from 'node:assert/strict'
import test from 'node:test'
import type { Query, SDKMessage, SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk'
import { createClaudeProviderSession, type ClaudeQueryFactoryInput } from '../src/claude/adapter.js'
import { ClaudeCredentialRedactor, ClaudeSdkTransport } from '../src/claude/transport.js'
import type { ClaudeAdapterEvent } from '../src/claude/types.js'

class FakeQuery implements AsyncGenerator<SDKMessage, void> {
  readonly options: ClaudeQueryFactoryInput['options']
  private readonly waiters: Array<{
    readonly resolve: (result: IteratorResult<SDKMessage, void>) => void
    readonly reject: (reason?: unknown) => void
  }> = []
  private readonly messages: SDKMessage[] = []
  private failure: unknown
  private closed = false

  constructor(options: ClaudeQueryFactoryInput['options']) {
    this.options = options
  }

  push(message: SDKMessage): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter.resolve({ value: message, done: false })
    else this.messages.push(message)
  }

  fail(error: unknown): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter.reject(error)
    else this.failure = error
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
    this.closed = true
    while (this.waiters.length > 0) this.waiters.shift()?.resolve({ value: undefined, done: true })
    return { value: undefined, done: true }
  }

  async throw(error?: unknown): Promise<IteratorResult<SDKMessage, void>> {
    this.closed = true
    throw error ?? new Error('fake query throw')
  }

  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> { return this }

  async interrupt(): Promise<never> { throw new Error('unused') }
  async setPermissionMode(): Promise<never> { throw new Error('unused') }
  async setMcpPermissionModeOverride(): Promise<never> { throw new Error('unused') }
  async setModel(): Promise<never> { throw new Error('unused') }
  async setMaxThinkingTokens(): Promise<never> { throw new Error('unused') }
  async applyFlagSettings(): Promise<never> { throw new Error('unused') }
  async initializationResult(): Promise<never> { throw new Error('unused') }
  async reinitialize(): Promise<never> { throw new Error('unused') }
  async supportedCommands(): Promise<never> { throw new Error('unused') }
  async supportedModels(): Promise<never> { throw new Error('unused') }
  async supportedAgents(): Promise<never> { throw new Error('unused') }
  async mcpServerStatus(): Promise<never> { throw new Error('unused') }
  async getContextUsage(): Promise<never> { throw new Error('unused') }
  async usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(): Promise<never> { throw new Error('unused') }
  async readFile(): Promise<never> { throw new Error('unused') }
  async reloadPlugins(): Promise<never> { throw new Error('unused') }
  async reloadSkills(): Promise<never> { throw new Error('unused') }
  async accountInfo(): Promise<never> { throw new Error('unused') }
  async rewindFiles(): Promise<never> { throw new Error('unused') }
  async seedReadState(): Promise<never> { throw new Error('unused') }
  async reconnectMcpServer(): Promise<never> { throw new Error('unused') }
  async toggleMcpServer(): Promise<never> { throw new Error('unused') }
  async setMcpServers(): Promise<never> { throw new Error('unused') }
  async streamInput(): Promise<never> { throw new Error('unused') }
  async stopTask(): Promise<never> { throw new Error('unused') }
  async backgroundTasks(): Promise<never> { throw new Error('unused') }
  close(): void { this.closed = true }
}

function createRedactor(): ClaudeCredentialRedactor {
  return ClaudeCredentialRedactor.fromAdapterOptions({
    authToken: 'token-secret',
    environment: {
      ANTHROPIC_AUTH_TOKEN: 'secret',
      ANTHROPIC_API_KEY: 'token',
    },
  })
}

function initMessage(): SDKSystemMessage {
  return {
    type: 'system',
    subtype: 'init',
    apiKeySource: 'none',
    claude_code_version: '0.0.0',
    cwd: process.cwd(),
    tools: [],
    mcp_servers: [],
    model: 'claude-sonnet',
    permissionMode: 'default',
    slash_commands: [],
    output_style: 'default',
    skills: [],
    plugins: [],
    uuid: '00000000-0000-4000-8000-000000000001',
    session_id: 'fake-session',
  }
}

test('Claude redactor handles repeated and overlapping credentials without redacting paths', () => {
  const redactor = createRedactor()
  const value = {
    repeated: 'token-secret token-secret secret token',
    nested: [{ value: 'token-secret' }, ['secret', 'token']],
    path: '/workspace/base-uri-file',
  }
  const redacted = redactor.redactValue(value)
  assert.equal(JSON.stringify(redacted).includes('token-secret'), false)
  assert.equal(JSON.stringify(redacted).includes('secret'), false)
  assert.equal(JSON.stringify(redacted).includes('token'), false)
  assert.equal((redacted as typeof value).path, '/workspace/base-uri-file')
})

test('Claude redactor copies Error causes, own fields, and nested JSON safely', () => {
  const redactor = createRedactor()
  const cause = new Error('cause token-secret')
  const error = new Error('top secret') as Error & { details: unknown }
  error.cause = cause
  error.details = { values: ['token-secret', { key: 'secret' }] }
  Object.defineProperty(error, 'hidden', { value: 'token-secret', enumerable: false })

  const redacted = redactor.redactError(error) as Error & { details: unknown; hidden: string }
  assert.equal(redacted.message.includes('secret'), false)
  assert.equal(redacted.stack?.includes('token-secret'), false)
  assert.equal(redacted.cause instanceof Error, true)
  assert.equal((redacted.cause as Error).message.includes('token-secret'), false)
  assert.equal(JSON.stringify(redacted.details).includes('secret'), false)
  assert.equal(redacted.hidden.includes('token-secret'), false)
})

test('Claude transport redacts Query iterator failures at its ended boundary', async () => {
  const redactor = createRedactor()
  let query: FakeQuery | undefined
  const transport = new ClaudeSdkTransport({}, ({ options }): Query => {
    query = new FakeQuery(options)
    return query
  }, redactor)
  const events: Array<{ readonly type: string; readonly error?: Error }> = []
  transport.subscribe(event => events.push(event))
  query?.fail(new Error('iterator token-secret'))
  while (!events.some(event => event.type === 'ended')) await new Promise(resolve => setImmediate(resolve))
  const ended = events.find(event => event.type === 'ended')
  assert.equal(ended?.error?.message.includes('token-secret'), false)
  await transport.close()
})

test('Claude permission handler failures are redacted through session events and rejection', async () => {
  const secret = 'permission-token-secret'
  let query: FakeQuery | undefined
  const events: ClaudeAdapterEvent[] = []
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    authToken: secret,
    permissionHandler: async () => { throw new Error(`permission failed: ${secret}`) },
    queryFactory: ({ options }): Query => {
      query = new FakeQuery(options)
      return query
    },
  })
  session.subscribe(event => events.push(event))
  try {
    assert.ok(query)
    const canUseTool = query.options.canUseTool
    assert.ok(canUseTool)
    await assert.rejects(canUseTool('Bash', { command: secret }, {
      signal: new AbortController().signal,
      toolUseID: 'tool-1',
      requestId: 'request-1',
    }), error => error instanceof Error && !error.message.includes(secret))
    assert.equal(JSON.stringify(events).includes(secret), false)
  } finally {
    await session.close()
  }
})

test('Claude session redacts initialization, turn_failed, and process_exited failures', async () => {
  const initSecret = 'init-token-secret'
  assert.throws(() => createClaudeProviderSession({
    cwd: process.cwd(),
    authToken: initSecret,
    queryFactory: (): Query => { throw new Error(`initialization ${initSecret}`) },
  }), error => error instanceof Error && !error.message.includes(initSecret))

  const turnSecret = 'turn-token-secret'
  let query: FakeQuery | undefined
  const events: ClaudeAdapterEvent[] = []
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    authToken: turnSecret,
    queryFactory: ({ options }): Query => {
      query = new FakeQuery(options)
      return query
    },
  })
  session.subscribe(event => events.push(event))
  try {
    const result = session.run('hello')
    assert.ok(query)
    query.fail(new Error(`process exited ${turnSecret}`))
    await assert.rejects(result, error => error instanceof Error && !error.message.includes(turnSecret))
    assert.equal(events.some(event => event.type === 'turn_failed'), true)
    assert.equal(events.some(event => event.type === 'process_exited'), true)
    assert.equal(JSON.stringify(events).includes(turnSecret), false)
  } finally {
    await session.close()
  }
})
