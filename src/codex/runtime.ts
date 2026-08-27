import type { JsonObject, JsonRpcLineTransport, JsonRpcRequestHandler, JsonValue } from './json-rpc.js'
import type { ExternalEngineEvent, ExternalEngineEventHandler } from '../agent/runtime.js'
import { JsonRpcLineTransport as LineTransport } from './json-rpc.js'
import { CodexProcess, type CodexProcessOptions, type ProcessExit } from './process.js'

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000

export interface CodexRuntimeOptions extends CodexProcessOptions {
  readonly modelProvider?: string
  readonly model?: string
  readonly reasoningEffort?: string
  readonly baseInstructions?: string
  readonly ephemeral?: boolean
  readonly approvalPolicy?: JsonValue
  readonly sandbox?: JsonValue
  readonly serverRequestHandler?: JsonRpcRequestHandler
  /** Upper bound for the initialize handshake; the timer is cleared on success and failure. */
  readonly startupTimeoutMs?: number
}

export interface CodexThread {
  readonly id: string
  readonly ephemeral?: boolean
}

export interface CodexTurn {
  readonly id: string
}

function object(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value
}

function string(value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

function threadFrom(value: JsonValue): CodexThread {
  const root = object(value, 'thread response')
  const thread = object(root['thread'], 'thread response.thread')
  return {
    id: string(thread['id'], 'thread id'),
    ...thread['ephemeral'] === undefined
      ? {}
      : { ephemeral: thread['ephemeral'] as boolean },
  }
}

function turnFrom(value: JsonValue): CodexTurn {
  const root = object(value, 'turn response')
  const turn = object(root['turn'], 'turn response.turn')
  return { id: string(turn['id'], 'turn id') }
}


function stringField(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberField(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function recordField(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined
}

function serialized(value: JsonValue | undefined): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

type TurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress'

function turnStatus(value: JsonValue | undefined): TurnStatus | undefined {
  const status = stringField(value)
  if (status === 'completed') return 'completed'
  if (status === 'interrupted' || status === 'canceled' || status === 'cancelled') return 'interrupted'
  if (status === 'failed' || status === 'error') return 'failed'
  if (status === 'inProgress' || status === 'in_progress' || status === 'running') return 'inProgress'
  return undefined
}

function startupTimeoutMs(value: number | undefined): number {
  const timeout = value ?? DEFAULT_STARTUP_TIMEOUT_MS
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Codex startup timeout must be a finite positive number')
  return timeout
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
  readonly reject: (error: Error) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function safeErrorMessage(error: JsonValue | undefined, fallback = 'Codex turn failed'): string {
  if (typeof error === 'string' && error.length > 0) return error
  const details = recordField(error)
  const message = stringField(details?.['message'])
  return message ?? (serialized(error) || fallback)
}

function canonicalUsage(tokenUsage: JsonObject): JsonObject {
  const total = recordField(tokenUsage['total'])
  const last = recordField(tokenUsage['last'])
  const usage: Record<string, JsonValue> = {}
  for (const [v2Key, canonicalKey] of [
    ['inputTokens', 'inputTokens'],
    ['cachedInputTokens', 'cachedInputTokens'],
    ['outputTokens', 'outputTokens'],
  ] as const) {
    const value = numberField(total?.[v2Key]) ?? numberField(last?.[v2Key])
    if (value !== undefined) usage[canonicalKey] = value
  }
  const contextWindow = numberField(tokenUsage['modelContextWindow'])
  if (contextWindow !== undefined) usage['contextWindowMaxTokens'] = contextWindow
  return usage as JsonObject
}

function itemStatus(value: JsonValue | undefined): string | undefined {
  return stringField(value)
}

function itemType(item: JsonObject): string | undefined {
  return stringField(item['type'])
}

function itemId(item: JsonObject, params?: JsonObject): string | undefined {
  return stringField(item['id']) ?? stringField(params?.['itemId'])
}

function itemError(item: JsonObject): JsonValue | undefined {
  const error = item['error']
  if (error !== undefined && error !== null) return error
  return item['isError'] === true ? item['output'] ?? item['result'] : undefined
}

function toolCallFromItem(item: JsonObject, params?: JsonObject): { readonly id: string; readonly name: string; readonly arguments: string; readonly itemType: string; readonly item: JsonObject } | undefined {
  const id = itemId(item, params)
  if (id === undefined) return undefined
  const type = itemType(item)
  if (type === 'commandExecution') {
    return { id, name: 'command_execution', arguments: JSON.stringify({ command: item['command'] ?? '', ...item['cwd'] === undefined ? {} : { cwd: item['cwd'] } }), itemType: type, item }
  }
  if (type === 'fileChange') {
    return { id, name: 'file_change', arguments: JSON.stringify({ changes: item['changes'] ?? item['patch'] ?? [] }), itemType: type, item }
  }
  if (type === 'mcpToolCall') {
    return {
      id,
      name: stringField(item['tool']) ?? 'mcp_tool',
      arguments: serialized(item['arguments'] ?? item['input'] ?? {}),
      itemType: type,
      item,
    }
  }
  if (type === 'dynamicToolCall') {
    return {
      id,
      name: stringField(item['name']) ?? stringField(item['tool']) ?? 'dynamic_tool',
      arguments: serialized(item['arguments'] ?? item['input'] ?? {}),
      itemType: type,
      item,
    }
  }
  if (type === 'webSearch') {
    return { id, name: 'web_search', arguments: serialized(item['query'] ?? item['input'] ?? {}), itemType: type, item }
  }
  if (type === 'computerCall' || type === 'computer_call') {
    return { id, name: 'computer', arguments: serialized(item['action'] ?? item['input'] ?? item), itemType: type, item }
  }
  return undefined
}

function toolResultFromItem(item: JsonObject, params?: JsonObject): { readonly id: string; readonly output: string; readonly isError: boolean; readonly status?: string; readonly error?: string; readonly errorDetails?: JsonValue; readonly itemType: string; readonly item: JsonObject } | undefined {
  const id = itemId(item, params)
  if (id === undefined) return undefined
  const status = itemStatus(item['status'])
  const error = itemError(item)
  const isError = status === 'failed' || status === 'declined' || status === 'error' || status === 'canceled' || status === 'cancelled' || error !== undefined
  const output = item['aggregatedOutput'] ?? item['output'] ?? item['stdout'] ?? item['stderr'] ?? item['result'] ?? item['changes'] ?? item['patch']
  return {
    id,
    output: serialized(output ?? itemError(item) ?? item),
    isError,
    ...status === undefined ? {} : { status },
    ...error === undefined ? {} : { error: safeErrorMessage(error, 'Codex tool failed'), errorDetails: error },
    itemType: itemType(item) ?? 'unknown',
    item,
  }
}

function defaultServerRequestHandler(method: string): JsonValue {
  switch (method) {
    case 'item/commandExecution/requestApproval':
    case 'item/fileChange/requestApproval':
      return { decision: 'decline' }
    case 'item/permissions/requestApproval':
      return { permissions: {}, scope: 'turn' }
    case 'item/tool/requestUserInput':
      return { answers: {} }
    case 'mcpServer/elicitation/request':
      return { action: 'decline', content: null, _meta: null }
    default:
      throw new Error(`unsupported Codex app-server request: ${method}`)
  }
}

/** Codex app-server lifecycle for one Harness Agent. */
export class CodexRuntime {
  readonly process: CodexProcess
  readonly transport: JsonRpcLineTransport
  private thread: CodexThread | undefined
  private turn: CodexTurn | undefined
  private closed = false
  private closePromise: Promise<ProcessExit> | undefined
  private readonly turnStatuses = new Map<string, TurnStatus>()
  private readonly startedTurnIds = new Set<string>()
  private readonly terminalThreadIds = new Set<string>()
  private readonly eventListeners = new Set<ExternalEngineEventHandler>()
  private pendingTurnStart: { readonly resolve: (turn: CodexTurn) => void; readonly reject: (error: Error) => void } | undefined
  private interruptPendingBeforeTurn = false

  private constructor(
    process: CodexProcess,
    transport: JsonRpcLineTransport,
    private readonly options: CodexRuntimeOptions,
  ) {
    this.process = process
    this.transport = transport
    this.transport.onRequest(options.serverRequestHandler ?? defaultServerRequestHandler)
    this.transport.onNotification((method, params) => this.handleNotification(method, params))
  }

  static async open(options: CodexRuntimeOptions): Promise<CodexRuntime> {
    const timeoutMs = startupTimeoutMs(options.startupTimeoutMs)
    const process = CodexProcess.start(options)
    const transport = new LineTransport(process.child.stdout, process.child.stdin)
    transport.start()
    const runtime = new CodexRuntime(process, transport, options)
    const startupAbort = new AbortController()
    const startupTimer = setTimeout(() => {
      startupAbort.abort(new Error(`Codex startup timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    startupTimer.unref?.()
    try {
      await runtime.initialize(startupAbort.signal)
      return runtime
    } catch (error: unknown) {
      const failure = startupAbort.signal.reason instanceof Error
        ? startupAbort.signal.reason
        : error instanceof Error ? error : new Error(String(error))
      transport.close(failure)
      try {
        await process.dispose()
      } catch (cleanupError: unknown) {
        throw new AggregateError([failure, cleanupError], 'Codex startup failed and process cleanup failed')
      }
      throw failure
    } finally {
      clearTimeout(startupTimer)
    }
  }

  get threadId(): string | undefined {
    return this.thread?.id
  }

  get turnId(): string | undefined {
    return this.turn?.id
  }

  onEvent(handler: ExternalEngineEventHandler): () => void {
    this.eventListeners.add(handler)
    return () => this.eventListeners.delete(handler)
  }

  private emit(event: ExternalEngineEvent): void {
    for (const listener of [...this.eventListeners]) listener(event)
  }

  private adoptTurn(turnId: string, emitStarted = true): CodexTurn {
    const turn = { id: turnId }
    this.turn = turn
    const firstObservation = !this.startedTurnIds.has(turnId)
    if (firstObservation) {
      this.startedTurnIds.add(turnId)
      this.turnStatuses.set(turnId, 'inProgress')
      if (emitStarted) this.emit({ type: 'turn_started', turnId, status: 'inProgress' })
    }
    this.pendingTurnStart?.resolve(turn)
    this.pendingTurnStart = undefined
    if (this.interruptPendingBeforeTurn) {
      this.interruptPendingBeforeTurn = false
      void this.interrupt().catch(() => {})
    }
    return turn
  }

  private turnIdFor(params: JsonObject | undefined, item?: JsonObject): string | undefined {
    const turn = recordField(params?.['turn'])
    return stringField(params?.['turnId']) ?? stringField(turn?.['id']) ?? stringField(item?.['turnId'])
  }

  private isTerminal(turnId: string | undefined): boolean {
    if (turnId === undefined) return false
    const status = this.turnStatuses.get(turnId)
    return status === 'completed' || status === 'interrupted' || status === 'failed'
  }

  private emitUnknownNotification(method: string, params: JsonValue | undefined): void {
    this.emit({ type: 'unknown-notification', method, ...params === undefined ? {} : { params } })
  }

  private projectItem(method: 'started' | 'completed', params: JsonObject, item: JsonObject, turnId: string | undefined): void {
    const type = itemType(item) ?? 'unknown'
    const id = itemId(item, params)
    if (type === 'agentMessage' || type === 'reasoning') {
      this.emit({
        type: method === 'started' ? 'item-started' : 'item-completed',
        ...turnId === undefined ? {} : { turnId },
        ...id === undefined ? {} : { itemId: id },
        itemType: type,
        item,
        ...itemStatus(item['status']) === undefined ? {} : { status: itemStatus(item['status']) },
        ...itemError(item) === undefined ? {} : { error: itemError(item) },
      })
      return
    }
    const tool = toolCallFromItem(item, params)
    if (tool === undefined) {
      this.emit({
        type: method === 'started' ? 'item-started' : 'item-completed',
        ...turnId === undefined ? {} : { turnId },
        ...id === undefined ? {} : { itemId: id },
        itemType: type,
        item,
        ...itemStatus(item['status']) === undefined ? {} : { status: itemStatus(item['status']) },
        ...itemError(item) === undefined ? {} : { error: itemError(item) },
      })
      return
    }
    if (method === 'started') {
      this.emit({ type: 'tool-call', ...turnId === undefined ? {} : { turnId }, ...tool, status: itemStatus(item['status']) ?? 'inProgress' })
      return
    }
    const result = toolResultFromItem(item, params)
    if (result !== undefined) this.emit({ type: 'tool-result', ...turnId === undefined ? {} : { turnId }, ...result })
  }

  private projectTurnStarted(params: JsonObject): void {
    const turn = recordField(params['turn'])
    const turnId = this.turnIdFor(params)
    const status = turnStatus(turn?.['status']) ?? 'inProgress'
    if (turnId === undefined || this.isTerminal(turnId)) return
    const threadId = stringField(params['threadId'])
    if (threadId !== undefined) this.terminalThreadIds.delete(threadId)
    const firstObservation = !this.startedTurnIds.has(turnId)
    this.adoptTurn(turnId, false)
    this.turnStatuses.set(turnId, status)
    if (firstObservation) this.emit({ type: 'turn_started', turnId, status, ...turn === undefined ? {} : { turn } })
  }

  private projectTurnCompleted(params: JsonObject): void {
    const turn = recordField(params['turn'])
    const turnId = this.turnIdFor(params)
    if (turnId === undefined || this.isTerminal(turnId)) return
    if (this.turn === undefined || this.turn.id !== turnId) this.adoptTurn(turnId)
    const status = turnStatus(turn?.['status']) ?? 'failed'
    const threadId = stringField(params['threadId'])
    this.turnStatuses.set(turnId, status)
    const error = turn?.['error']
    const preservedStatus = stringField(turn?.['status']) ?? status
    const rawUsage = recordField(turn?.['usage']) ?? recordField(params['usage']) ?? recordField(params['tokenUsage'])
    const usage = rawUsage === undefined
      ? undefined
      : recordField(rawUsage['total']) !== undefined || recordField(rawUsage['last']) !== undefined || rawUsage['modelContextWindow'] !== undefined
        ? canonicalUsage(rawUsage)
        : rawUsage
    if (status === 'completed') {
      if (threadId !== undefined) this.terminalThreadIds.add(threadId)
      this.emit({ type: 'turn_completed', turnId, status: preservedStatus, ...usage === undefined ? {} : { usage }, ...turn === undefined ? {} : { turn } })
      if (this.turn?.id === turnId) this.turn = undefined
      return
    }
    if (status === 'interrupted') {
      if (threadId !== undefined) this.terminalThreadIds.add(threadId)
      this.emit({ type: 'turn_canceled', turnId, reason: safeErrorMessage(error, 'Codex turn interrupted'), status: preservedStatus, ...turn === undefined ? {} : { turn } })
      if (this.turn?.id === turnId) this.turn = undefined
      return
    }
    if (status === 'inProgress') {
      this.emit({ type: 'turn_started', turnId, status, ...turn === undefined ? {} : { turn } })
      return
    }
    if (threadId !== undefined) this.terminalThreadIds.add(threadId)
    const errorDetails = recordField(error)
    const codexErrorInfo = recordField(errorDetails?.['codexErrorInfo'])
    const code = stringField(errorDetails?.['code']) ?? stringField(codexErrorInfo?.['code'])
    const diagnostic = stringField(errorDetails?.['diagnostic']) ?? stringField(errorDetails?.['additionalDetails'])
    this.emit({
      type: 'turn_failed',
      turnId,
      error: safeErrorMessage(error),
      ...error === undefined ? {} : { errorDetails: error },
      ...code === undefined ? {} : { code },
      ...diagnostic === undefined ? {} : { diagnostic },
      status: preservedStatus,
      ...turn === undefined ? {} : { turn },
    })
    if (this.turn?.id === turnId) this.turn = undefined
  }

  private handleNotification(method: string, rawParams: JsonValue | undefined): void {
    const params = typeof rawParams === 'object' && rawParams !== null && !Array.isArray(rawParams)
      ? rawParams as JsonObject
      : undefined
    if (params === undefined) {
      this.emitUnknownNotification(method, rawParams)
      return
    }
    const item = recordField(params['item'])
    const eventTurnId = this.turnIdFor(params, item)
    const threadId = stringField(params['threadId'])
    if (eventTurnId !== undefined && this.turn === undefined && !this.isTerminal(eventTurnId)) {
      if (threadId !== undefined) this.terminalThreadIds.delete(threadId)
      this.adoptTurn(eventTurnId)
    }
    if (method === 'turn/started') {
      this.projectTurnStarted(params)
      return
    }
    if (method === 'turn/completed') {
      this.projectTurnCompleted(params)
      return
    }
    if (this.isTerminal(eventTurnId ?? this.turn?.id)) return
    if (method === 'item/agentMessage/delta') {
      const delta = stringField(params['delta'])
      if (delta !== undefined) this.emit({ type: 'text-delta', ...eventTurnId === undefined ? {} : { turnId: eventTurnId }, ...stringField(params['itemId']) === undefined ? {} : { itemId: stringField(params['itemId']) }, text: delta })
      return
    }
    if (method === 'item/reasoning/textDelta' || method === 'item/reasoning/summaryTextDelta') {
      const delta = stringField(params['delta'])
      if (delta !== undefined) this.emit({
        type: 'reasoning',
        ...eventTurnId === undefined ? {} : { turnId: eventTurnId },
        ...stringField(params['itemId']) === undefined ? {} : { itemId: stringField(params['itemId']) },
        ...numberField(params['contentIndex']) === undefined ? {} : { contentIndex: numberField(params['contentIndex']) },
        ...numberField(params['summaryIndex']) === undefined ? {} : { summaryIndex: numberField(params['summaryIndex']) },
        stream: method.endsWith('summaryTextDelta') ? 'summary' : 'text',
        text: delta,
      })
      return
    }
    if (method === 'item/started') {
      if (item !== undefined) this.projectItem('started', params, item, eventTurnId)
      return
    }
    if (method === 'item/completed') {
      if (item !== undefined) this.projectItem('completed', params, item, eventTurnId)
      return
    }
    if (method === 'item/commandExecution/outputDelta' || method === 'item/fileChange/outputDelta') {
      const delta = stringField(params['delta'])
      if (delta !== undefined) this.emit({ type: 'tool-output-delta', ...(eventTurnId === undefined ? {} : { turnId: eventTurnId }), ...(stringField(params['itemId']) === undefined ? {} : { itemId: stringField(params['itemId']) }), itemType: method.startsWith('item/command') ? 'commandExecution' : 'fileChange', delta })
      return
    }
    if (method === 'item/fileChange/patchUpdated') {
      const changes = params['changes'] ?? params['patch']
      this.emit({ type: 'file-change', ...(eventTurnId === undefined ? {} : { turnId: eventTurnId }), ...(stringField(params['itemId']) === undefined ? {} : { itemId: stringField(params['itemId']) }), ...(changes === undefined ? {} : { changes }), ...(params['patch'] === undefined ? {} : { patch: params['patch'] }) })
      return
    }
    if (method === 'item/mcpToolCall/progress') {
      const progress = params['progress'] ?? params['message'] ?? params['delta']
      this.emit({ type: 'mcp-progress', ...(eventTurnId === undefined ? {} : { turnId: eventTurnId }), ...(stringField(params['itemId']) === undefined ? {} : { itemId: stringField(params['itemId']) }), ...(progress === undefined ? {} : { progress }) })
      return
    }
    if (method === 'thread/tokenUsage/updated') {
      const tokenUsage = recordField(params['tokenUsage'])
      if (tokenUsage !== undefined) this.emit({ type: 'usage_updated', ...(eventTurnId === undefined ? {} : { turnId: eventTurnId }), usage: canonicalUsage(tokenUsage), tokenUsage })
      return
    }
    if (method === 'process/outputDelta') {
      const delta = stringField(params['delta'])
      if (delta !== undefined) this.emit({ type: 'process-output-delta', ...(stringField(params['processId']) === undefined ? {} : { processId: stringField(params['processId']) }), delta })
      return
    }
    if (method === 'process/exited') {
      this.emit({ type: 'process-exited', ...(stringField(params['processId']) === undefined ? {} : { processId: stringField(params['processId']) }), ...(numberField(params['exitCode']) === undefined ? {} : { exitCode: numberField(params['exitCode']) }), ...(stringField(params['signal']) === undefined ? {} : { signal: stringField(params['signal']) }), ...(stringField(params['status']) === undefined ? {} : { status: stringField(params['status']) }) })
      return
    }
    if (threadId !== undefined && this.turn === undefined && this.terminalThreadIds.has(threadId)) return
    this.emitUnknownNotification(method, params)
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    await this.transport.request('initialize', {
      clientInfo: {
        name: 'dsh-engine-suite',
        title: 'DeepSeek Harness Engine Suite',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
      },
    }, signal)
    await this.transport.notify('initialized')
  }

  async listModels(options: { readonly includeHidden?: boolean; readonly limit?: number } = {}, signal?: AbortSignal): Promise<readonly JsonObject[]> {
    const response = await this.transport.request('model/list', {
      includeHidden: options.includeHidden ?? true,
      ...options.limit === undefined ? {} : { limit: options.limit },
    }, signal)
    const root = object(response, 'model/list response')
    const data = root['data']
    if (!Array.isArray(data)) throw new Error('model/list response.data must be an array')
    return data.map((entry, index) => object(entry, `model/list response.data[${index}]`))
  }

  async startThread(signal?: AbortSignal): Promise<CodexThread> {
    const response = await this.transport.request('thread/start', {
      cwd: this.options.cwd,
      ephemeral: this.options.ephemeral ?? false,
      ...this.options.model === undefined ? {} : { model: this.options.model },
      ...this.options.modelProvider === undefined ? {} : { modelProvider: this.options.modelProvider },
      ...this.options.baseInstructions === undefined ? {} : { baseInstructions: this.options.baseInstructions },
      ...this.options.approvalPolicy === undefined ? {} : { approvalPolicy: this.options.approvalPolicy },
      ...this.options.sandbox === undefined ? {} : { sandbox: this.options.sandbox },
    }, signal)
    this.thread = threadFrom(response)
    return this.thread
  }

  async resumeThread(threadId: string, signal?: AbortSignal): Promise<CodexThread> {
    if (threadId.trim() === '') throw new Error('thread id must not be empty')
    const response = await this.transport.request('thread/resume', { threadId }, signal)
    this.thread = threadFrom(response)
    return this.thread
  }

  async startTurn(text: string, signal?: AbortSignal): Promise<CodexTurn> {
    if (this.thread === undefined) throw new Error('cannot start a turn before a thread exists')
    if (text.trim() === '') throw new Error('turn text must not be empty')
    if (this.pendingTurnStart !== undefined) throw new Error('Codex turn start is already pending')
    this.interruptPendingBeforeTurn = false
    const start = deferred<CodexTurn>()
    this.pendingTurnStart = { resolve: start.resolve, reject: start.reject }
    const response = this.transport.request('turn/start', {
      threadId: this.thread.id,
      input: [{ type: 'text', text, text_elements: [] }],
      ...this.options.model === undefined ? {} : { model: this.options.model },
      ...this.options.reasoningEffort === undefined ? {} : { effort: this.options.reasoningEffort },
    }, signal)
    void response.then(
      value => {
        const turn = turnFrom(value)
        if (this.isTerminal(turn.id)) {
          this.pendingTurnStart?.resolve(turn)
          this.pendingTurnStart = undefined
          return
        }
        if (this.turn === undefined || this.turn.id !== turn.id) this.adoptTurn(turn.id)
        else this.pendingTurnStart?.resolve(turn)
      },
      error => {
        const failure = error instanceof Error ? error : new Error(String(error))
        this.pendingTurnStart?.reject(failure)
        this.pendingTurnStart = undefined
      },
    )
    return start.promise
  }

  async steer(text: string, signal?: AbortSignal): Promise<JsonValue> {
    if (this.thread === undefined || this.turn === undefined) throw new Error('cannot steer without an active thread and turn')
    if (text.trim() === '') throw new Error('steering text must not be empty')
    return this.transport.request('turn/steer', {
      threadId: this.thread.id,
      expectedTurnId: this.turn.id,
      input: [{ type: 'text', text, text_elements: [] }],
    }, signal)
  }

  async interrupt(signal?: AbortSignal): Promise<JsonValue> {
    if (this.thread === undefined) return null
    if (this.turn === undefined) {
      if (this.pendingTurnStart !== undefined) this.interruptPendingBeforeTurn = true
      return null
    }
    return this.transport.request('turn/interrupt', {
      threadId: this.thread.id,
      turnId: this.turn.id,
    }, signal)
  }

  async close(): Promise<ProcessExit> {
    if (this.closePromise !== undefined) return this.closePromise
    this.closed = true
    this.pendingTurnStart?.reject(new Error('Codex runtime is closed'))
    this.pendingTurnStart = undefined
    this.interruptPendingBeforeTurn = false
    this.turn = undefined
    this.transport.close()
    this.closePromise = this.process.dispose()
    return this.closePromise
  }
}
