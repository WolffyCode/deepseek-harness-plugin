import assert from 'node:assert/strict'
import test from 'node:test'
import type { SDKControlInitializeResponse, SDKMessage, Query } from '@anthropic-ai/claude-agent-sdk'
import { createClaudeProviderSession, type ClaudeAdapterEvent, type ClaudeAgentSession, type ClaudeQueryFactoryInput, type ClaudeThinkingOption } from '../src/claude/adapter.js'
import type { ClaudeInputMessage, ClaudeQueryFactory, ClaudeCatalog } from '../src/claude/types.js'
import type { CanonicalMcpSet } from '../src/claude/mcp.js'
import type { CanonicalSkillAssets } from '../src/claude/skills.js'

class FakeQuery implements AsyncGenerator<SDKMessage, void> {
  readonly options: ClaudeQueryFactoryInput['options']
  private readonly messages: SDKMessage[] = []
  private readonly waiters: Array<(result: IteratorResult<SDKMessage>) => void> = []
  private done = false
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
  async throw(error?: unknown): Promise<IteratorResult<SDKMessage>> { this.done = true; throw error }
  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> { return this }
  async interrupt(): Promise<void> { await this.return() }
  async setModel(): Promise<void> {}
  async setPermissionMode(): Promise<void> {}
  async setMaxThinkingTokens(): Promise<void> {}
  async initializationResult(): Promise<Record<string, unknown>> { return {} }
  async supportedCommands(): Promise<unknown[]> { return [{ name: '/help', description: 'Help' }] }
  async supportedModels(): Promise<unknown[]> { return [{ id: 'claude-sonnet', displayName: 'Sonnet' }] }
  async mcpServerStatus(): Promise<unknown[]> { return [{ name: 'local', status: 'connected' }] }
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

function init(sessionId: string): SDKMessage {
  return { type: 'system', subtype: 'init', session_id: sessionId, model: 'claude-sonnet', permissionMode: 'default', slash_commands: ['/help'], skills: ['review'], mcp_servers: [], capabilities: ['interrupt_receipt_v1'] } as unknown as SDKMessage
}

test('ClaudeProviderSession maps streaming timeline, reasoning, tools, usage and result', async () => {
  let query!: FakeQuery
  const session = createClaudeProviderSession({ cwd: process.cwd(), model: 'claude-sonnet', queryFactory: ({ options }) => { query = new FakeQuery(options); return query as unknown as Query } })
  const events: ClaudeAdapterEvent[] = []
  session.subscribe(event => events.push(event))
  const nativeSessionId = query.options.sessionId
  assert.ok(typeof nativeSessionId === 'string')
  const resultPromise = session.run('hello')
  query.push(init(nativeSessionId))
  query.push({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hel' }, index: 0 } } as unknown as SDKMessage)
  query.push({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'plan' }, index: 1 } } as unknown as SDKMessage)
  query.push({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'pwd' } }] } } as unknown as SDKMessage)
  query.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'ok', is_error: false }] } } as unknown as SDKMessage)
  query.push({ type: 'result', subtype: 'success', is_error: false, result: 'hello', usage: { input_tokens: 2, output_tokens: 3 }, total_cost_usd: 0.01, session_id: 'native-session-1' } as unknown as SDKMessage)
  const result = await resultPromise
  assert.equal(result.sessionId, nativeSessionId)
  assert.equal(result.finalText, 'hel')
  assert.equal(events.some(event => event.type === 'timeline' && event.item.type === 'reasoning'), true)
  assert.equal(events.some(event => event.type === 'timeline' && event.item.type === 'tool_call'), true)
  assert.equal(events.some(event => event.type === 'timeline' && event.item.type === 'tool_result'), true)
  assert.equal(events.some(event => event.type === 'usage_updated'), true)
  assert.equal(events.some(event => event.type === 'turn_completed'), true)
  assert.equal(session.persistenceHandle()?.nativeHandle, nativeSessionId)
  await session.refreshCatalog()
  assert.deepEqual(session.listCommands(), [{ name: '/help', description: 'Help', argumentHint: '', source: 'sdk' }])
  await session.close()
})

test('ClaudeProviderSession preserves SDK model identity and effort metadata from initialization', async () => {
  let query!: FakeQuery
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    model: 'glm-5.3',
    queryFactory: ({ options }) => {
      query = new FakeQuery(options)
      return query as unknown as Query
    },
  })
  const nativeSessionId = query.options.sessionId
  assert.ok(typeof nativeSessionId === 'string')
  const resultPromise = session.run('catalog')
  query.push({
    type: 'system',
    subtype: 'init',
    session_id: nativeSessionId,
    model: 'glm-5.3',
    models: [{
      value: 'glm-5.3',
      resolvedModel: 'glm-5.3',
      displayName: 'GLM 5.3',
      description: 'GLM model',
      contextWindow: 1_000_000,
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'max'],
    }],
  } as unknown as SDKMessage)
  query.push({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: nativeSessionId } as unknown as SDKMessage)
  await resultPromise

  assert.deepEqual(session.catalog.models, [{
    id: 'glm-5.3',
    value: 'glm-5.3',
    resolvedModel: 'glm-5.3',
    label: 'GLM 5.3',
    description: 'GLM model',
    contextWindow: 1_000_000,
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium', 'high', 'max'],
  }])
  await session.close()
})

test('ClaudeProviderSession maps MCP result block variants and nested content', async () => {
  let query!: FakeQuery
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    queryFactory: ({ options }) => {
      query = new FakeQuery(options)
      return query as unknown as Query
    },
  })
  const events: ClaudeAdapterEvent[] = []
  session.subscribe(event => events.push(event))
  const nativeSessionId = query.options.sessionId
  assert.ok(typeof nativeSessionId === 'string')
  const turnPromise = session.run('use the MCP tool')
  query.push(init(nativeSessionId))
  query.push({
    type: 'assistant',
    parent_tool_use_id: null,
    message: { content: [{ type: 'mcp_tool_use', id: 'mcp-tool-1', name: 'mcp__asset-fixture__asset_echo', input: { text: 'input' } }] },
  } as unknown as SDKMessage)
  query.push({
    type: 'user',
    message: {
      content: [{
        type: 'mcp_tool_result',
        tool_use_id: 'mcp-tool-1',
        content: [{ type: 'text', text: 'MCP_FIXTURE_RESULT:' }, { content: [{ type: 'text', text: 'input' }] }],
        isError: false,
      }],
    },
  } as unknown as SDKMessage)
  query.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: nativeSessionId } as unknown as SDKMessage)
  await turnPromise

  const toolCall = events.find(event => event.type === 'timeline' && event.item.type === 'tool_call')
  const toolResult = events.find(event => event.type === 'timeline' && event.item.type === 'tool_result')
  assert.equal(toolCall?.type, 'timeline')
  assert.equal(toolCall?.item.name, 'mcp__asset-fixture__asset_echo')
  assert.equal(toolResult?.type, 'timeline')
  assert.equal(toolResult?.item.output, 'MCP_FIXTURE_RESULT:input')
  assert.equal(toolResult?.item.isError, false)
  await session.close()
})


test('ClaudeProviderSession projects local slash-command output into final text', async () => {
  let query!: FakeQuery
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    queryFactory: ({ options }) => {
      query = new FakeQuery(options)
      return query as unknown as Query
    },
  })
  const events: ClaudeAdapterEvent[] = []
  session.subscribe(event => events.push(event))
  const nativeSessionId = query.options.sessionId
  assert.ok(typeof nativeSessionId === 'string')
  const resultPromise = session.run('/claude-asset-e2e')
  query.push(init(nativeSessionId))
  query.push({
    type: 'system',
    subtype: 'local_command_output',
    content: 'CLAUDE_SKILL_ASSET_OK',
    session_id: nativeSessionId,
  } as unknown as SDKMessage)
  query.push({ type: 'result', subtype: 'success', is_error: false, result: '', session_id: nativeSessionId } as unknown as SDKMessage)

  const result = await resultPromise
  assert.equal(result.finalText, 'CLAUDE_SKILL_ASSET_OK')
  assert.equal(events.some(event => event.type === 'timeline' && event.item.type === 'assistant_message' && event.item.text === 'CLAUDE_SKILL_ASSET_OK'), true)
  await session.close()
})

test('ClaudeProviderSession waits for permission response and supports resume', async () => {
  let query!: FakeQuery
  const session = createClaudeProviderSession({ cwd: process.cwd(), resumeSessionId: 'resume-me', queryFactory: ({ options }) => { query = new FakeQuery(options); return query as unknown as Query } })
  const events: ClaudeAdapterEvent[] = []
  session.subscribe(event => events.push(event))
  const permissionPromise = query.options.canUseTool!('Bash', { command: 'pwd' }, { requestId: 'permission-1', toolUseID: 'tool-1', signal: new AbortController().signal })
  const request = await waitFor(() => events.find(event => event.type === 'permission_requested')?.request)
  assert.equal(request.requestId, 'permission-1')
  assert.equal(session.respondToPermission('permission-1', { behavior: 'allow', updatedInput: { command: 'pwd' } }), true)
  assert.deepEqual(await permissionPromise, { behavior: 'allow', updatedInput: { command: 'pwd' } })
  assert.equal((query.options as { resume?: string }).resume, 'resume-me')
  await session.close()
})

test('ClaudeProviderSession registers SDK permission requests before notifying UI and preserves the full response', async () => {
  let query!: FakeQuery
  const session = createClaudeProviderSession({ cwd: process.cwd(), queryFactory: ({ options }) => { query = new FakeQuery(options); return query as unknown as Query } })
  const events: ClaudeAdapterEvent[] = []
  session.subscribe(event => {
    events.push(event)
    if (event.type !== 'permission_requested') return
    assert.equal(session.pendingPermissions().length, 1)
    assert.notEqual(event.request.requestId, event.request.toolUseId)
    if (event.request.toolName === 'Write') {
      assert.equal(session.respondToPermission(event.request.requestId, {
        behavior: 'allow',
        updatedInput: { file_path: '/tmp/approved.txt', content: 'approved' },
        updatedPermissions: [{ type: 'addRules', rules: [{ toolName: 'Write', ruleContent: '/tmp/**' }], behavior: 'allow', destination: 'session' }],
        toolUseID: 'tool-allow-response',
        decisionClassification: 'user_permanent',
      }), true)
    } else {
      assert.equal(session.respondToPermission(event.request.requestId, {
        behavior: 'deny',
        message: 'not approved',
        interrupt: true,
        toolUseID: 'tool-deny-response',
        decisionClassification: 'user_reject',
      }), true)
    }
  })

  const allowed = await query.options.canUseTool!('Write', { file_path: '/tmp/original.txt', content: 'original' }, {
    requestId: 'sdk-control-allow',
    toolUseID: 'tool-allow',
    signal: new AbortController().signal,
  })
  assert.deepEqual(allowed, {
    behavior: 'allow',
    updatedInput: { file_path: '/tmp/approved.txt', content: 'approved' },
    updatedPermissions: [{ type: 'addRules', rules: [{ toolName: 'Write', ruleContent: '/tmp/**' }], behavior: 'allow', destination: 'session' }],
    toolUseID: 'tool-allow-response',
    decisionClassification: 'user_permanent',
  })

  const denied = await query.options.canUseTool!('Bash', { command: 'rm -rf /tmp/nope' }, {
    requestId: 'sdk-control-deny',
    toolUseID: 'tool-deny',
    signal: new AbortController().signal,
  })
  assert.deepEqual(denied, {
    behavior: 'deny',
    message: 'not approved',
    interrupt: true,
    toolUseID: 'tool-deny-response',
    decisionClassification: 'user_reject',
  })
  assert.equal(session.pendingPermissions().length, 0)
  assert.equal(events.filter(event => event.type === 'permission_resolved').length, 2)
  await session.close()
})


test('ClaudeProviderSession supplies original tool input for every SDK allow path', async () => {
  const originalInput = { text: 'MCP_ASSET_INPUT' }
  let handlerQuery!: FakeQuery
  const handlerSession = createClaudeProviderSession({
    cwd: process.cwd(),
    permissionHandler: async () => ({ behavior: 'allow' }),
    queryFactory: ({ options }) => {
      handlerQuery = new FakeQuery(options)
      return handlerQuery as unknown as Query
    },
  })
  let defaultQuery!: FakeQuery
  const defaultSession = createClaudeProviderSession({
    cwd: process.cwd(),
    defaultPermission: { behavior: 'allow' },
    queryFactory: ({ options }) => {
      defaultQuery = new FakeQuery(options)
      return defaultQuery as unknown as Query
    },
  })
  let interactiveQuery!: FakeQuery
  const interactiveSession = createClaudeProviderSession({
    cwd: process.cwd(),
    queryFactory: ({ options }) => {
      interactiveQuery = new FakeQuery(options)
      return interactiveQuery as unknown as Query
    },
  })
  interactiveSession.subscribe(event => {
    if (event.type === 'permission_requested') {
      assert.equal(interactiveSession.respondToPermission(event.request.requestId, { behavior: 'allow' }), true)
    }
  })

  try {
    const requestOptions = (requestId: string) => ({ requestId, toolUseID: `${requestId}-tool`, signal: new AbortController().signal })
    const handlerResult = await handlerQuery.options.canUseTool!('mcp__asset-fixture__asset_echo', originalInput, requestOptions('handler'))
    const defaultResult = await defaultQuery.options.canUseTool!('mcp__asset-fixture__asset_echo', originalInput, requestOptions('default'))
    const interactiveResult = await interactiveQuery.options.canUseTool!('mcp__asset-fixture__asset_echo', originalInput, requestOptions('interactive'))

    assert.deepEqual(handlerResult, { behavior: 'allow', updatedInput: originalInput })
    assert.deepEqual(defaultResult, { behavior: 'allow', updatedInput: originalInput })
    assert.deepEqual(interactiveResult, { behavior: 'allow', updatedInput: originalInput })
  } finally {
    await handlerSession.close()
    await defaultSession.close()
    await interactiveSession.close()
  }
})

test('ClaudeProviderSession denies malformed allow updatedInput instead of executing original input', async () => {
  let handlerQuery!: FakeQuery
  const handlerSession = createClaudeProviderSession({
    cwd: process.cwd(),
    permissionHandler: async () => ({ behavior: 'allow', updatedInput: ['unsafe'] } as unknown as { behavior: 'allow'; updatedInput: Record<string, unknown> }),
    queryFactory: ({ options }) => {
      handlerQuery = new FakeQuery(options)
      return handlerQuery as unknown as Query
    },
  })
  let interactiveQuery!: FakeQuery
  const interactiveSession = createClaudeProviderSession({
    cwd: process.cwd(),
    queryFactory: ({ options }) => {
      interactiveQuery = new FakeQuery(options)
      return interactiveQuery as unknown as Query
    },
  })
  interactiveSession.subscribe(event => {
    if (event.type === 'permission_requested') {
      assert.equal(interactiveSession.respondToPermission(event.request.requestId, { behavior: 'allow', updatedInput: ['unsafe'] } as unknown as { behavior: 'allow'; updatedInput: Record<string, unknown> }), true)
    }
  })
  const expected = {
    behavior: 'deny' as const,
    message: 'Claude permission allow decision has invalid updatedInput; tool execution was denied',
  }
  try {
    const request = {
      requestId: 'malformed-updated-input',
      toolUseID: 'malformed-tool',
      signal: new AbortController().signal,
    }
    const handlerResult = await handlerQuery.options.canUseTool!('Bash', { command: 'safe-looking-input' }, request)
    const interactiveResult = await interactiveQuery.options.canUseTool!('Bash', { command: 'safe-looking-input' }, { ...request, requestId: 'malformed-interactive-input' })
    assert.deepEqual(handlerResult, expected)
    assert.deepEqual(interactiveResult, expected)
  } finally {
    await handlerSession.close()
    await interactiveSession.close()
  }
})

test('ClaudeProviderSession handles failure and cancellation without leaking active turns', async () => {
  let query!: FakeQuery
  const session = createClaudeProviderSession({ cwd: process.cwd(), queryFactory: ({ options }) => { query = new FakeQuery(options); return query as unknown as Query } })
  await session.whenReady?.()
  const failed = session.run('fail')
  await new Promise<void>(resolve => setImmediate(resolve))
  query.push({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'upstream failed', session_id: 's' } as unknown as SDKMessage)
  await assert.rejects(failed, /upstream failed/)
  const next = session.startTurn('cancel')
  await next
  await session.interrupt()
  assert.equal((session as { pendingPermissions?: () => unknown }).pendingPermissions !== undefined, true)
  await session.close()
})


test('ClaudeProviderSession enables dangerous permission bypass only for bypassPermissions mode', async () => {
  let defaultQuery: WiringFakeQuery | undefined
  const defaultSession = createClaudeProviderSession({
    cwd: process.cwd(),
    permissionMode: 'default',
    queryFactory: ({ options }) => {
      defaultQuery = new WiringFakeQuery(options)
      return defaultQuery as unknown as Query
    },
  })
  assert.ok(defaultQuery !== undefined)
  assert.equal(Object.hasOwn(defaultQuery.options as Record<string, unknown>, 'allowDangerouslySkipPermissions'), false)
  await defaultSession.close()

  let bypassQuery: WiringFakeQuery | undefined
  const bypassSession = createClaudeProviderSession({
    cwd: process.cwd(),
    permissionMode: 'bypassPermissions',
    queryFactory: ({ options }) => {
      bypassQuery = new WiringFakeQuery(options)
      return bypassQuery as unknown as Query
    },
  })
  assert.ok(bypassQuery !== undefined)
  assert.equal(bypassQuery.options.allowDangerouslySkipPermissions, true)
  await bypassSession.close()
})

test('ClaudeProviderSession composes permission, dialog, catalog, MCP and Skill adapters', async () => {
  let query: WiringFakeQuery | undefined
  let promptIterator: AsyncIterator<ClaudeInputMessage> | undefined
  const events: ClaudeAdapterEvent[] = []
  const mcpAssets: CanonicalMcpSet = {
    scope: 'user',
    servers: [{
      name: 'workspace-tools',
      transport: 'stdio',
      command: 'node',
      args: ['server.mjs'],
      env: { WORKSPACE: '/tmp/workspace' },
      credentialRefs: { MCP_TOKEN: 'mcp-token' },
    }],
  }
  const skillAssets: CanonicalSkillAssets = {
    scope: 'user',
    pluginDirs: ['/tmp/claude-plugin'],
    additionalDirectories: ['/tmp/claude-skills'],
  }
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    model: 'glm-5.3-max',
    mcpAssets,
    skillAssets,
    credentialResolver: { resolve: reference => reference === 'mcp-token' ? 'resolved-at-runtime' : undefined },
    permissionTimeoutMs: 500,
    queryFactory: ({ prompt, options }) => {
      promptIterator = prompt[Symbol.asyncIterator]()
      query = new WiringFakeQuery(options)
      return query as unknown as Query
    },
  })
  assert.ok(query !== undefined)
  assert.ok(promptIterator !== undefined)
  session.subscribe(event => events.push(event))

  const sdkOptions = query.options as Record<string, unknown>
  assert.equal(Object.hasOwn(sdkOptions, 'allowDangerouslySkipPermissions'), false, 'default permission mode must not launch with bypass enabled')
  assert.equal(sdkOptions['strictMcpConfig'], true, 'Claude must use only explicitly injected MCP servers')
  assert.deepEqual(sdkOptions['mcpServers'], {
    'workspace-tools': {
      type: 'stdio',
      command: 'node',
      args: ['server.mjs'],
      env: { WORKSPACE: '/tmp/workspace', MCP_TOKEN: 'resolved-at-runtime' },
    },
  })
  assert.deepEqual(sdkOptions['plugins'], [{ type: 'local', path: '/tmp/claude-plugin' }])
  assert.deepEqual(sdkOptions['additionalDirectories'], ['/tmp/claude-skills'])
  for (const forbidden of ['systemPrompt', 'appendSystemPrompt', 'tools', 'agents']) {
    assert.equal(Object.hasOwn(sdkOptions, forbidden), false, `forbidden SDK option leaked: ${forbidden}`)
  }

  const nativeSessionId = query.options.sessionId
  assert.ok(typeof nativeSessionId === 'string')
  query.push(init(nativeSessionId))
  await session.whenReady?.()

  const catalog = await session.refreshCatalog()
  assert.deepEqual(catalog.commands, [{ name: 'help', description: 'Help', argumentHint: '<arg>', source: 'sdk' }])
  assert.equal(catalog.models.some(model => model.id.toLowerCase().includes('opus')), false)
  assert.equal(catalog.models.some(model => model.id === 'glm-5.3-max'), true)

  const permissionPromise = query.options.canUseTool?.(
    'Bash',
    { command: 'pwd' },
    {
      requestId: 'permission-wiring',
      toolUseID: 'tool-wiring',
      signal: new AbortController().signal,
      suggestions: [],
      title: 'Run pwd',
      displayName: 'Run command',
      description: 'Execute in workspace',
      decisionReason: 'workspace access',
    },
  )
  assert.ok(permissionPromise !== undefined)
  const permissionRequest = await waitFor(() => {
    const event = events.find((candidate): candidate is Extract<ClaudeAdapterEvent, { type: 'permission_requested' }> => candidate.type === 'permission_requested' && candidate.request.requestId === 'permission-wiring')
    return event?.request
  })
  assert.equal(permissionRequest.toolUseId, 'tool-wiring')
  assert.equal(session.pendingPermissions().length, 1)
  assert.equal(session.respondToPermission('permission-wiring', { behavior: 'allow', updatedInput: { command: 'pwd' } }), true)
  assert.deepEqual(await permissionPromise, { behavior: 'allow', updatedInput: { command: 'pwd' } })
  assert.equal(session.pendingPermissions().length, 0)

  const questionPromise = query.options.onUserDialog?.(
    { dialogKind: 'ask_user_question', payload: { questions: [{ question: 'Continue?', options: [] }] }, toolUseID: 'question-tool' },
    { requestId: 'question-wiring', signal: new AbortController().signal },
  )
  assert.ok(questionPromise !== undefined)
  await waitFor(() => events.find((candidate): candidate is Extract<ClaudeAdapterEvent, { type: 'user_question_requested' }> => candidate.type === 'user_question_requested' && candidate.request.requestId === 'question-wiring')?.request)
  assert.equal(session.respondToUserQuestion('question-wiring', { behavior: 'completed', result: { answers: { Continue: 'yes' } } }), true)
  assert.deepEqual(await questionPromise, { behavior: 'completed', result: { answers: { Continue: 'yes' } } })

  const turn = await session.startTurn('hello')
  const input = await promptIterator.next()
  assert.equal(input.done, false)
  if (!input.done) assert.equal(input.value.message.content, 'hello')
  query.push({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 'native-session-1' } as unknown as SDKMessage)
  assert.equal(turn.turnId, 'claude-turn-1')
  await session.close()
})

test('ClaudeProviderSession forwards slash input, applies next-turn settings, emits subagents and exposes rewind', async () => {
  let query: WiringFakeQuery | undefined
  let promptIterator: AsyncIterator<ClaudeInputMessage> | undefined
  const events: ClaudeAdapterEvent[] = []
  const rewindCalls: string[] = []
  const session = createClaudeProviderSession({
    cwd: process.cwd(),
    model: 'glm-5.3-max',
    rewindSdk: {
      forkSession: async (sessionId, options) => {
        rewindCalls.push(`fork:${sessionId}:${options.upToMessageId}`)
        return { sessionId: 'forked-session' }
      },
    },
    queryFactory: ({ prompt, options }) => {
      promptIterator = prompt[Symbol.asyncIterator]()
      query = new WiringFakeQuery(options)
      return query as unknown as Query
    },
  })
  assert.ok(query !== undefined)
  assert.ok(promptIterator !== undefined)
  session.subscribe(event => events.push(event))
  const nativeSessionId = query.options.sessionId
  assert.ok(typeof nativeSessionId === 'string')
  query.push(init(nativeSessionId))
  await session.whenReady?.()

  const rawSlash = '/help "two words"  '
  await session.startTurn(rawSlash)
  const slashInput = await promptIterator.next()
  assert.equal(slashInput.done, false)
  if (!slashInput.done) assert.equal(slashInput.value.message.content, rawSlash)
  await session.setModel('glm-5.3-max')
  await session.setMode('plan')
  await session.setThinking({ type: 'enabled', budgetTokens: 256 })
  assert.deepEqual(query.setModelCalls, [])
  assert.deepEqual(query.setPermissionModeCalls, [])
  assert.deepEqual(query.thinkingCalls, [])
  query.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 'native-session-1' } as unknown as SDKMessage)
  await waitFor(() => events.find(candidate => candidate.type === 'turn_completed'))

  await session.startTurn('second')
  assert.deepEqual(query.setModelCalls, ['glm-5.3-max'])
  assert.deepEqual(query.setPermissionModeCalls, ['plan'])
  assert.deepEqual(query.thinkingCalls, [{ tokens: 256, display: undefined }])
  const secondInput = await promptIterator.next()
  assert.equal(secondInput.done, false)
  if (!secondInput.done) assert.equal(secondInput.value.message.content, 'second')

  query.push({ type: 'system', subtype: 'task_progress', task_id: 'task-1', summary: 'working' } as unknown as SDKMessage)
  query.push({ type: 'system', subtype: 'task_started', task_id: 'task-1', tool_use_id: 'tool-task-1', task_type: 'local_agent', description: 'inspect files' } as unknown as SDKMessage)
  query.push({ type: 'system', subtype: 'task_notification', task_id: 'task-1', status: 'completed', summary: 'finished' } as unknown as SDKMessage)
  const subagentEvents = await waitFor(() => {
    const values = events.filter((candidate): candidate is Extract<ClaudeAdapterEvent, { type: 'provider_subagent' }> => candidate.type === 'provider_subagent')
    return values.length >= 3 ? values : undefined
  })
  assert.deepEqual(subagentEvents.map(candidate => candidate.event.kind), ['declared', 'progress', 'result'])
  query.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 'native-session-1' } as unknown as SDKMessage)
  await waitFor(() => events.filter(candidate => candidate.type === 'turn_completed').length >= 2 ? true : undefined)

  const rewind = await session.rewind({ mode: 'both', messageId: 'message-1' })
  assert.deepEqual(rewindCalls, [`fork:${nativeSessionId}:message-1`])
  assert.equal(rewind.files?.canRewind, true)
  assert.equal(rewind.sessionId, 'forked-session')
  assert.equal(session.persistenceHandle()?.nativeHandle, 'forked-session')
  await session.close()
})

class WiringFakeQuery {
  readonly options: ClaudeQueryFactoryInput['options']
  readonly setModelCalls: Array<string | undefined> = []
  readonly setPermissionModeCalls: string[] = []
  readonly thinkingCalls: Array<{ readonly tokens: number | null; readonly display: 'summarized' | 'omitted' | undefined }> = []
  private readonly messages: SDKMessage[] = []
  private readonly waiters: Array<(result: IteratorResult<SDKMessage>) => void> = []
  private done = false
  constructor(options: ClaudeQueryFactoryInput['options']) { this.options = options }
  push(message: SDKMessage): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: message, done: false })
    else this.messages.push(message)
  }
  async next(): Promise<IteratorResult<SDKMessage>> {
    if (this.messages.length > 0) return { value: this.messages.shift()!, done: false }
    if (this.done) return { value: undefined as never, done: true }
    return new Promise(resolve => this.waiters.push(resolve))
  }
  async return(): Promise<IteratorResult<SDKMessage>> {
    this.done = true
    while (this.waiters.length > 0) this.waiters.shift()!({ value: undefined as never, done: true })
    return { value: undefined as never, done: true }
  }
  async throw(error?: unknown): Promise<IteratorResult<SDKMessage>> { this.done = true; throw error instanceof Error ? error : new Error(String(error)) }
  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> { return this }
  async interrupt(): Promise<void> { await this.return() }
  async setModel(model?: string): Promise<void> { this.setModelCalls.push(model) }
  async setPermissionMode(mode: string): Promise<void> { this.setPermissionModeCalls.push(mode) }
  async setMaxThinkingTokens(tokens: number | null, display?: 'summarized' | 'omitted' | null): Promise<void> { this.thinkingCalls.push({ tokens, display: display ?? undefined }) }
  async applyFlagSettings(): Promise<void> {}
  async initializationResult(): Promise<SDKControlInitializeResponse> {
    return {
      commands: [{ name: 'help', description: 'Help', argumentHint: '<arg>', aliases: ['h'] }],
      agents: [],
      output_style: '',
      available_output_styles: [],
      models: [
        { value: 'glm-5.3-max', displayName: 'GLM 5.3 Max', description: 'GLM' },
        { value: 'claude-opus-4', displayName: 'Claude Opus', description: 'Forbidden' },
      ],
      account: {},
    }
  }
  async supportedCommands(): Promise<readonly { name: string; description: string; argumentHint: string; aliases: string[] }[]> { return [{ name: 'help', description: 'Help', argumentHint: '<arg>', aliases: ['h'] }] }
  async supportedModels(): Promise<readonly { value: string; displayName: string; description: string }[]> { return [{ value: 'glm-5.3-max', displayName: 'GLM 5.3 Max', description: 'GLM' }, { value: 'claude-opus-4', displayName: 'Claude Opus', description: 'Forbidden' }] }
  async mcpServerStatus(): Promise<readonly { name: string; status: string }[]> { return [{ name: 'workspace-tools', status: 'connected' }] }
  async rewindFiles(): Promise<{ canRewind: boolean; filesChanged: string[] }> { return { canRewind: true, filesChanged: ['README.md'] } }
}
