import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  SDKControlInitializeResponse,
  SDKMessage,
  Query,
} from '@anthropic-ai/claude-agent-sdk'
import {
  createClaudeProviderSession,
  type ClaudeAdapterEvent,
  type ClaudeAgentSession,
  type ClaudeAdapterOptions,
  type ClaudeCatalog,
  type ClaudeQueryFactoryInput,
  type ClaudeThinkingOption,
} from '../src/claude/adapter.js'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'

function initializationResult(): SDKControlInitializeResponse {
  return {
    commands: [],
    agents: [],
    output_style: '',
    available_output_styles: [],
    models: [],
    account: {},
  }
}

function systemInit(sessionId: string): SDKMessage {
  return {
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    apiKeySource: 'none',
    claude_code_version: 'test',
    cwd: process.cwd(),
    tools: [],
    mcp_servers: [],
    model: 'claude-sonnet',
    permissionMode: 'default',
    slash_commands: [],
    output_style: '',
    skills: [],
    plugins: [],
    uuid: '00000000-0000-4000-8000-000000000000',
  } as unknown as SDKMessage
}

class FakeQuery implements AsyncGenerator<SDKMessage, void> {
  readonly options: ClaudeQueryFactoryInput['options']
  private readonly messages: SDKMessage[] = []
  private readonly waiters: Array<(result: IteratorResult<SDKMessage, void>) => void> = []
  private done = false
  private readonly initialization: Promise<SDKControlInitializeResponse>
  initializationCalls = 0
  returnCalls = 0

  constructor(
    options: ClaudeQueryFactoryInput['options'],
    initialization: Promise<SDKControlInitializeResponse> = Promise.resolve(initializationResult()),
  ) {
    this.options = options
    this.initialization = initialization
  }

  initializationResult(): Promise<SDKControlInitializeResponse> {
    this.initializationCalls += 1
    return this.initialization
  }

  push(message: SDKMessage): void {
    if (this.done) throw new Error('fake query is closed')
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: message, done: false })
    else this.messages.push(message)
  }

  async next(): Promise<IteratorResult<SDKMessage, void>> {
    if (this.messages.length > 0) return { value: this.messages.shift()!, done: false }
    if (this.done) return { value: undefined, done: true }
    return new Promise(resolve => this.waiters.push(resolve))
  }

  async return(): Promise<IteratorResult<SDKMessage, void>> {
    this.returnCalls += 1
    if (this.done) return { value: undefined, done: true }
    this.done = true
    while (this.waiters.length > 0) this.waiters.shift()!({ value: undefined, done: true })
    return { value: undefined, done: true }
  }

  async throw(error?: unknown): Promise<IteratorResult<SDKMessage, void>> {
    this.done = true
    throw error instanceof Error ? error : new Error(String(error))
  }

  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> {
    return this
  }
}

function createSessionWithQuery(
  initialization: Promise<SDKControlInitializeResponse> = Promise.resolve(initializationResult()),
): { readonly session: ClaudeAgentSession; readonly query: FakeQuery } {
  let query: FakeQuery | undefined
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    model: 'claude-sonnet',
    queryFactory: ({ options }: ClaudeQueryFactoryInput) => {
      query = new FakeQuery(options, initialization)
      return query as unknown as Query
    },
  })
  assert.ok(query)
  return { session, query }
}

function tick(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

function makeFakeSession(): {
  readonly session: ClaudeAgentSession
  readonly resolveReady: () => void
  readonly calls: string[]
  readonly setNativeSessionId: (sessionId: string) => void
} {
  const catalog: ClaudeCatalog = { models: [], commands: [], modes: [], skills: [], mcpServers: [], capabilities: [] }
  const listeners = new Set<(event: ClaudeAdapterEvent) => void>()
  const calls: string[] = []
  let nativeSessionId: string | undefined
  let resolveReady!: () => void
  const ready = new Promise<void>(resolve => { resolveReady = resolve })
  const session: ClaudeAgentSession = {
    get sessionId(): string | undefined { return nativeSessionId },
    capabilities: {},
    catalog,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async startTurn(): Promise<{ readonly turnId: string }> { calls.push('start'); return { turnId: 'turn-1' } },
    async run(): Promise<never> { throw new Error('unused') },
    async interrupt(): Promise<void> { calls.push('interrupt') },
    async close(): Promise<void> { calls.push('close') },
    async setMode(): Promise<void> {},
    async setModel(): Promise<void> {},
    async setThinking(_thinking: ClaudeThinkingOption): Promise<void> {},
    async setPermissionMode(): Promise<void> {},
    respondToPermission(): boolean { return false },
    respondToUserQuestion(): boolean { return false },
    pendingPermissions() { return [] },
    persistenceHandle() {
      return nativeSessionId === undefined
        ? undefined
        : { provider: 'claude-cli' as const, sessionId: nativeSessionId, nativeHandle: nativeSessionId, cwd: process.cwd() }
    },
    listCommands() { return [] },
    async refreshCatalog(): Promise<ClaudeCatalog> { return catalog },
    async steer(): Promise<{ readonly status: 'unavailable' }> { return { status: 'unavailable' } },
    async whenReady(): Promise<void> { calls.push('ready'); await ready },
  }
  void listeners
  return {
    session,
    resolveReady: () => {
      nativeSessionId = 'native-session-from-init'
      resolveReady()
    },
    calls,
    setNativeSessionId: sessionId => { nativeSessionId = sessionId },
  }
}

function registerClaudeSelection(suite: ReturnType<typeof createEngineSuiteRuntime>): void {
  suite.providers.register({ id: 'provider', engineId: 'claude-cli', name: 'Provider', baseUri: 'https://example.test', credentialRef: 'credential' })
  suite.models.register({
    id: 'model',
    engineId: 'claude-cli',
    providerId: 'provider',
    modelId: 'claude-sonnet',
    reasoningOptions: [{ id: 'high' }],
    source: 'manual',
  })
}

test('Claude readiness requires initializationResult and keeps the native id unset before system/init', async () => {
  let resolveInitialization!: (value: SDKControlInitializeResponse) => void
  const initialization = new Promise<SDKControlInitializeResponse>(resolve => { resolveInitialization = resolve })
  const { session, query } = createSessionWithQuery(initialization)

  assert.equal(session.sessionId, undefined)
  const firstReady = session.whenReady?.()
  const secondReady = session.whenReady?.()
  assert.ok(firstReady)
  assert.strictEqual(firstReady, secondReady)
  assert.equal(query.initializationCalls, 1)

  query.push(systemInit('native-session-real'))
  await tick()
  assert.equal(session.sessionId, 'native-session-real')
  assert.equal(query.initializationCalls, 1)

  let settled = false
  void firstReady.then(() => { settled = true })
  await tick()
  assert.equal(settled, false)

  resolveInitialization(initializationResult())
  await firstReady
  assert.equal(session.persistenceHandle()?.nativeHandle, 'native-session-real')
  await session.close()
})

test('Claude whenReady is idempotent and resolves with the real system/init session id', async () => {
  const { session, query } = createSessionWithQuery()
  const firstReady = session.whenReady?.()
  const secondReady = session.whenReady?.()
  assert.ok(firstReady)
  assert.strictEqual(firstReady, secondReady)

  query.push(systemInit('native-session-idempotent'))
  await Promise.all([firstReady, secondReady])
  assert.equal(session.sessionId, 'native-session-idempotent')
  assert.equal(session.persistenceHandle()?.nativeHandle, 'native-session-idempotent')
  assert.equal(query.initializationCalls, 1)
  await session.close()
})

test('Claude initialization failure closes the transport and rejects whenReady', async () => {
  const initializationFailure = new Error('initialization failed')
  const { session, query } = createSessionWithQuery(Promise.reject(initializationFailure))
  const whenReady = session.whenReady
  assert.ok(whenReady)
  const ready = whenReady.call(session)

  await assert.rejects(ready, /initialization failed/)
  assert.equal(query.returnCalls, 1)
  const secondReady = session.whenReady
  assert.ok(secondReady)
  await assert.rejects(secondReady.call(session), /initialization failed/)
})

test('EngineSuite waits for Claude readiness and returns only the real native session id', async () => {
  const fake = makeFakeSession()
  const suite = createEngineSuiteRuntime({ claudeSessionFactory: () => fake.session })
  registerClaudeSelection(suite)

  let settled = false
  const opening = suite.openEngine(
    { engineId: 'claude-cli', providerId: 'provider', modelRecordId: 'model', reasoningEffort: 'high' },
    { apiKey: 'secret', cwd: process.cwd() },
  ).finally(() => { settled = true })

  await tick()
  assert.equal(settled, false)
  assert.deepEqual(fake.calls, ['ready'])

  fake.resolveReady()
  const opened = await opening
  assert.equal(opened.nativeSessionId, 'native-session-from-init')
  await opened.close()
})
