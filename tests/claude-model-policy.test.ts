import assert from 'node:assert/strict'
import test from 'node:test'
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import {
  ClaudeProviderSession,
  filterClaudeCatalogModels,
} from '../src/claude/session.js'
import type {
  ClaudeAdapterEvent,
  ClaudeAdapterOptions,
  ClaudeAgentSession,
  ClaudeCatalog,
  ClaudePermissionMode,
  ClaudeQueryFactoryInput,
  ClaudeRunResult,
  ClaudeThinkingOption,
  ClaudeUserQuestionResult,
} from '../src/claude/types.js'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'

type CatalogModel = {
  readonly id: string
  readonly value?: string
  readonly name?: string
  readonly model?: string
  readonly displayName?: string
  readonly resolvedModel?: string
}

class FakeQuery implements AsyncGenerator<SDKMessage, void> {
  readonly options: ClaudeQueryFactoryInput['options']
  readonly setModelCalls: Array<string | undefined> = []
  private done = false
  private readonly waiters: Array<(result: IteratorResult<SDKMessage>) => void> = []

  constructor(private readonly models: readonly CatalogModel[], options: ClaudeQueryFactoryInput['options']) {
    this.options = options
  }

  async next(): Promise<IteratorResult<SDKMessage>> {
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
  async interrupt(): Promise<void> { await this.return() }
  async setModel(model?: string): Promise<void> { this.setModelCalls.push(model) }
  async setPermissionMode(): Promise<void> {}
  async setMaxThinkingTokens(): Promise<void> {}
  async initializationResult(): Promise<Record<string, unknown>> { return {} }
  async supportedCommands(): Promise<unknown[]> { return [] }
  async supportedModels(): Promise<unknown[]> { return [...this.models] }
  async mcpServerStatus(): Promise<unknown[]> { return [] }
}

const emptyCatalog: ClaudeCatalog = {
  models: [],
  commands: [],
  modes: [],
  skills: [],
  mcpServers: [],
  capabilities: [],
}

class FakeSession implements ClaudeAgentSession {
  readonly sessionId = 'fake-session'
  readonly capabilities: Readonly<Record<string, boolean>> = {}
  readonly catalog = emptyCatalog
  private readonly listeners = new Set<(event: ClaudeAdapterEvent) => void>()

  subscribe(listener: (event: ClaudeAdapterEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async startTurn(): Promise<{ readonly turnId: string }> { return { turnId: 'fake-turn' } }
  async run(): Promise<ClaudeRunResult> { throw new Error('unused') }
  async interrupt(): Promise<void> {}
  async close(): Promise<void> {}
  async setMode(): Promise<void> {}
  async setModel(): Promise<void> {}
  async setThinking(_thinking: ClaudeThinkingOption): Promise<void> {}
  async setPermissionMode(_mode: ClaudePermissionMode): Promise<void> {}
  respondToPermission(): boolean { return false }
  respondToUserQuestion(_requestId: string, _result: ClaudeUserQuestionResult): boolean { return false }
  pendingPermissions(): readonly never[] { return [] }
  persistenceHandle(): undefined { return undefined }
  listCommands(): readonly never[] { return [] }
  async refreshCatalog(): Promise<ClaudeCatalog> { return emptyCatalog }
  async steer(): Promise<{ readonly status: 'accepted' | 'unavailable' }> { return { status: 'unavailable' } }
}

function modelInput(id: string, modelId: string, displayName?: string) {
  return {
    id,
    engineId: 'claude-cli' as const,
    providerId: 'claude-provider',
    modelId,
    ...(displayName === undefined ? {} : { displayName }),
    source: 'manual' as const,
  }
}

function registerClaudeProvider(suite: ReturnType<typeof createEngineSuiteRuntime>): void {
  suite.providers.register({
    id: 'claude-provider',
    engineId: 'claude-cli',
    name: 'Claude Provider',
    baseUri: 'https://example.test',
    credentialRef: 'claude-credential',
  })
}

test('filters every Opus field from supportedModels without mutating input', async () => {
  const models: CatalogModel[] = [
    { id: 'opus-value', value: 'claude-opus' },
    { id: 'opus-display', displayName: 'Claude OPUS' },
    { id: 'opus-resolved', resolvedModel: 'claude-3-opus-latest' },
    { id: 'opus-name', name: 'claude-opus-name' },
    { id: 'opus-model', model: 'claude-opus-model' },
    { id: 'sonnet', value: 'claude-sonnet', displayName: 'Claude Sonnet' },
  ]
  const before = structuredClone(models)
  const fakeQuery = new FakeQuery(models, {} as ClaudeQueryFactoryInput['options'])
  const session = new ClaudeProviderSession({
    cwd: process.cwd(),
    queryFactory: (_input: ClaudeQueryFactoryInput): Query => fakeQuery as unknown as Query,
  })

  await session.refreshCatalog()

  assert.deepEqual(session.catalog.models.map(model => model.id), ['sonnet'])
  assert.deepEqual(models, before)
  assert.deepEqual(filterClaudeCatalogModels(models), [models[5]])
  await session.close()
})

test('rejects Opus at Claude session construction and model switching', async () => {
  assert.throws(
    () => new ClaudeProviderSession({ cwd: process.cwd(), model: 'claude-3-opus' }),
    /Claude Opus models are not supported by this plugin/,
  )

  const fakeQuery = new FakeQuery([], {} as ClaudeQueryFactoryInput['options'])
  const session = new ClaudeProviderSession({
    cwd: process.cwd(),
    model: 'claude-sonnet',
    queryFactory: (_input: ClaudeQueryFactoryInput): Query => fakeQuery as unknown as Query,
  })

  await assert.rejects(
    session.setModel('claude-opus'),
    /Claude Opus models are not supported by this plugin/,
  )
  await session.setModel('glm-5.3')
  assert.deepEqual(fakeQuery.setModelCalls, ['glm-5.3'])
  await session.close()
})

test('rejects or filters Claude Opus model records and selections while keeping GLM 5.3 usable', async () => {
  const created: ClaudeAdapterOptions[] = []
  const suite = createEngineSuiteRuntime({
    claudeSessionFactory: (options: ClaudeAdapterOptions) => {
      created.push(options)
      return new FakeSession()
    },
  })
  registerClaudeProvider(suite)

  assert.throws(
    () => suite.models.register(modelInput('opus-register', 'claude-sonnet', 'Claude Opus')),
    /Claude Opus models are not supported by this plugin/,
  )

  suite.models.replaceAll([
    modelInput('opus-value', 'claude-opus'),
    modelInput('opus-display', 'claude-sonnet', 'Claude Opus'),
    modelInput('opus-id', 'claude-sonnet'),
    modelInput('glm-opencodebay/glm-5.3', 'glm-5.3', 'GLM 5.3'),
  ])

  assert.deepEqual(suite.models.list().map(model => model.id), ['glm-opencodebay/glm-5.3'])
  for (const modelRecordId of ['opus-value', 'opus-display', 'opus-id']) {
    assert.throws(
      () => suite.resolveProfile({ engineId: 'claude-cli', providerId: 'claude-provider', modelRecordId }),
      /Claude Opus models are not supported by this plugin/,
    )
    await assert.rejects(
      suite.openEngine({ engineId: 'claude-cli', providerId: 'claude-provider', modelRecordId }, { apiKey: 'secret', cwd: process.cwd() }),
      /Claude Opus models are not supported by this plugin/,
    )
  }

  const selection = {
    engineId: 'claude-cli' as const,
    providerId: 'claude-provider',
    modelRecordId: 'glm-opencodebay/glm-5.3',
  }
  const profile = suite.resolveProfile(selection)
  assert.equal(profile.modelId, 'glm-5.3')
  const opened = await suite.openEngine(selection, { apiKey: 'secret', cwd: process.cwd() })
  assert.equal(created[0]?.model, 'glm-5.3')
  await opened.close()
})
