import type {
  CanUseTool,
  OnUserDialog,
  PermissionResult as SdkPermissionResult,
  PermissionUpdate as SdkPermissionUpdate,
  UserDialogRequest as SdkUserDialogRequest,
  UserDialogResult as SdkUserDialogResult,
} from '@anthropic-ai/claude-agent-sdk'

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'

export type ThinkingConfig =
  | { readonly type: 'adaptive'; readonly display?: 'summarized' | 'omitted' }
  | { readonly type: 'enabled'; readonly budgetTokens?: number; readonly display?: 'summarized' | 'omitted' }
  | { readonly type: 'disabled' }

export type PermissionDestination = 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg'
export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export type PermissionRule = { readonly toolName: string; readonly ruleContent?: string }

export type PermissionUpdate =
  | { readonly type: 'addRules'; readonly rules: readonly PermissionRule[]; readonly behavior: PermissionBehavior; readonly destination: PermissionDestination }
  | { readonly type: 'replaceRules'; readonly rules: readonly PermissionRule[]; readonly behavior: PermissionBehavior; readonly destination: PermissionDestination }
  | { readonly type: 'removeRules'; readonly rules: readonly PermissionRule[]; readonly behavior: PermissionBehavior; readonly destination: PermissionDestination }
  | { readonly type: 'setMode'; readonly mode: PermissionMode; readonly destination: PermissionDestination }
  | { readonly type: 'addDirectories'; readonly directories: readonly string[]; readonly destination: PermissionDestination }
  | { readonly type: 'removeDirectories'; readonly directories: readonly string[]; readonly destination: PermissionDestination }

export interface CanUseToolOptions {
  readonly signal: AbortSignal
  readonly suggestions?: readonly PermissionUpdate[]
  readonly blockedPath?: string
  readonly decisionReason?: string
  readonly title?: string
  readonly displayName?: string
  readonly description?: string
  readonly toolUseID: string
  readonly agentID?: string
  readonly requestId: string
  readonly matchedAskRule?: { readonly source: string; readonly toolName: string; readonly ruleContent?: string }
}

export interface PermissionRequest {
  readonly requestId: string
  readonly toolName: string
  readonly input: Record<string, unknown>
  readonly suggestions?: readonly PermissionUpdate[]
  readonly blockedPath?: string
  readonly decisionReason?: string
  readonly title?: string
  readonly displayName?: string
  readonly description?: string
  readonly toolUseId?: string
  readonly agentId?: string
  readonly matchedAskRule?: { readonly source: string; readonly toolName: string; readonly ruleContent?: string }
  readonly permissionMode: PermissionMode
}

export type PermissionResponse =
  | { readonly behavior: 'allow'; readonly updatedInput?: Record<string, unknown>; readonly updatedPermissions?: readonly PermissionUpdate[]; readonly toolUseId?: string; readonly decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject' }
  | { readonly behavior: 'deny'; readonly message: string; readonly interrupt?: boolean; readonly toolUseId?: string; readonly decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject' }

export interface UserDialogRequest {
  readonly requestId: string
  readonly dialogKind: string
  readonly payload: Record<string, unknown>
  readonly toolUseId?: string
}

export type UserDialogResponse = { readonly behavior: 'completed'; readonly result: unknown } | { readonly behavior: 'cancelled' }
export type PermissionRegistryState = 'pending' | 'resolved' | 'expired' | 'canceled' | 'unknown'

export class ControlError extends Error {
  readonly code: 'duplicate' | 'unknown' | 'timeout' | 'canceled' | 'invalid_input' | 'stale'
  constructor(code: ControlError['code'], message: string) {
    super(message)
    this.name = 'ControlError'
    this.code = code
  }
}

type JsonObject = Record<string, unknown>
type TimerHandle = number | ReturnType<typeof setTimeout>
interface TimerDriver {
  setTimeout(callback: () => void, delayMs: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSecretKey(key: string): boolean {
  return /(secret|token|password|passwd|api[-_]?key|auth|credential|private[-_]?key|cookie|authorization)/i.test(key)
}

function cloneValue(value: unknown, redact: boolean, key = ''): unknown {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || value instanceof WeakMap || value instanceof WeakSet) return undefined
  if (redact && isSecretKey(key)) return '[REDACTED]'
  if (value instanceof Date) return new Date(value.getTime()).toISOString()
  if (Array.isArray(value)) return value.map(item => cloneValue(item, redact)).filter((item): item is Exclude<unknown, undefined> => item !== undefined)
  if (isObject(value)) {
    const copy: JsonObject = {}
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryKey === 'signal' || entryKey === 'requestId' || entryKey === 'callback' || entryKey === 'handler' || entryKey === 'onAbort') continue
      const cloned = cloneValue(entryValue, redact, entryKey)
      if (cloned !== undefined) copy[entryKey] = cloned
    }
    return copy
  }
  return value
}

function cloneRecord(value: Record<string, unknown>, redact: boolean): Record<string, unknown> {
  const cloned = cloneValue(value, redact)
  return isObject(cloned) ? cloned : {}
}

function clonePermissionUpdate(update: PermissionUpdate): PermissionUpdate {
  switch (update.type) {
    case 'addRules':
    case 'replaceRules':
    case 'removeRules':
      return { type: update.type, rules: update.rules.map(rule => ({ toolName: rule.toolName, ...(rule.ruleContent === undefined ? {} : { ruleContent: rule.ruleContent }) })), behavior: update.behavior, destination: update.destination }
    case 'setMode':
      return { type: 'setMode', mode: update.mode, destination: update.destination }
    case 'addDirectories':
    case 'removeDirectories':
      return { type: update.type, directories: [...update.directories], destination: update.destination }
  }
}

function toSdkPermissionUpdate(update: PermissionUpdate): SdkPermissionUpdate {
  switch (update.type) {
    case 'addRules':
    case 'replaceRules':
    case 'removeRules':
      return { type: update.type, rules: update.rules.map(rule => ({ toolName: rule.toolName, ...(rule.ruleContent === undefined ? {} : { ruleContent: rule.ruleContent }) })), behavior: update.behavior, destination: update.destination }
    case 'setMode':
      return { type: 'setMode', mode: update.mode, destination: update.destination }
    case 'addDirectories':
    case 'removeDirectories':
      return { type: update.type, directories: [...update.directories], destination: update.destination }
  }
}

export function toPermissionRequest(toolName: string, input: Record<string, unknown>, options: CanUseToolOptions, permissionMode: PermissionMode): PermissionRequest {
  return {
    requestId: options.requestId,
    toolName,
    input: cloneRecord(input, true),
    ...(options.suggestions === undefined ? {} : { suggestions: options.suggestions.map(clonePermissionUpdate) }),
    ...(options.blockedPath === undefined ? {} : { blockedPath: options.blockedPath }),
    ...(options.decisionReason === undefined ? {} : { decisionReason: options.decisionReason }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.toolUseID === undefined ? {} : { toolUseId: options.toolUseID }),
    ...(options.agentID === undefined ? {} : { agentId: options.agentID }),
    ...(options.matchedAskRule === undefined ? {} : { matchedAskRule: { source: options.matchedAskRule.source, toolName: options.matchedAskRule.toolName, ...(options.matchedAskRule.ruleContent === undefined ? {} : { ruleContent: options.matchedAskRule.ruleContent }) } }),
    permissionMode,
  }
}

export function toSdkPermissionResult(response: PermissionResponse): SdkPermissionResult {
  if (response.behavior === 'deny') {
    return {
      behavior: 'deny',
      message: response.message,
      ...(response.interrupt === undefined ? {} : { interrupt: response.interrupt }),
      ...(response.toolUseId === undefined ? {} : { toolUseID: response.toolUseId }),
      ...(response.decisionClassification === undefined ? {} : { decisionClassification: response.decisionClassification }),
    }
  }
  return {
    behavior: 'allow',
    ...(response.updatedInput === undefined ? {} : { updatedInput: cloneRecord(response.updatedInput, false) }),
    ...(response.updatedPermissions === undefined ? {} : { updatedPermissions: response.updatedPermissions.map(toSdkPermissionUpdate) }),
    ...(response.toolUseId === undefined ? {} : { toolUseID: response.toolUseId }),
    ...(response.decisionClassification === undefined ? {} : { decisionClassification: response.decisionClassification }),
  }
}

export type PermissionRequestCallback = (request: PermissionRequest) => PermissionResponse | Promise<PermissionResponse>

export function createCanUseToolHandler(callback: PermissionRequestCallback, options: { readonly permissionMode: PermissionMode }): CanUseTool {
  return async (toolName, input, sdkOptions) => toSdkPermissionResult(await callback(toPermissionRequest(toolName, input, sdkOptions, options.permissionMode)))
}

export function toUserDialogRequest(request: SdkUserDialogRequest, requestId: string): UserDialogRequest {
  return { requestId, dialogKind: request.dialogKind, payload: cloneRecord(request.payload, true), ...(request.toolUseID === undefined ? {} : { toolUseId: request.toolUseID }) }
}

export type UserDialogCallback = (request: UserDialogRequest) => UserDialogResponse | Promise<UserDialogResponse>

export function createOnUserDialogHandler(callback: UserDialogCallback): OnUserDialog {
  return async (request, options) => {
    const result = await callback(toUserDialogRequest(request, options.requestId))
    return result as SdkUserDialogResult
  }
}

export interface AskQuestionOption { readonly label: string; readonly description?: string }
export interface AskQuestion {
  readonly question: string
  readonly header?: string
  readonly options: readonly AskQuestionOption[]
  readonly multiSelect?: boolean
  readonly allowOther?: boolean
}
export interface AskUserQuestionRequest extends PermissionRequest {
  readonly kind: 'ask_user_question'
  readonly questions: readonly AskQuestion[]
}
export type AskUserQuestionResponse =
  | { readonly behavior: 'completed'; readonly answers: Readonly<Record<string, string | readonly string[]>> }
  | { readonly behavior: 'cancelled' }

function parseAskQuestions(input: Record<string, unknown>): AskQuestion[] {
  const questions = input['questions']
  if (!Array.isArray(questions)) throw new ControlError('invalid_input', 'AskUserQuestion requires questions')
  return questions.map((raw, index) => {
    if (!isObject(raw) || typeof raw['question'] !== 'string' || !Array.isArray(raw['options'])) throw new ControlError('invalid_input', `Invalid AskUserQuestion item ${index}`)
    const options = raw['options'].map((option, optionIndex) => {
      if (!isObject(option) || typeof option['label'] !== 'string') throw new ControlError('invalid_input', `Invalid AskUserQuestion option ${optionIndex}`)
      return { label: option['label'], ...(typeof option['description'] === 'string' ? { description: option['description'] } : {}) }
    })
    return {
      question: raw['question'],
      ...(typeof raw['header'] === 'string' ? { header: raw['header'] } : {}),
      options,
      ...(typeof raw['multiSelect'] === 'boolean' ? { multiSelect: raw['multiSelect'] } : {}),
      ...(typeof raw['allowOther'] === 'boolean' ? { allowOther: raw['allowOther'] } : {}),
    }
  })
}

export function toAskUserQuestion(toolName: string, input: Record<string, unknown>, options: CanUseToolOptions, permissionMode: PermissionMode = 'default'): AskUserQuestionRequest {
  if (toolName !== 'AskUserQuestion') throw new ControlError('invalid_input', 'Expected AskUserQuestion tool')
  const request = toPermissionRequest(toolName, input, options, permissionMode)
  return { ...request, kind: 'ask_user_question', questions: parseAskQuestions(input) }
}

function canonicalQuestionKey(question: AskQuestion): string {
  return question.question.trim() || question.header?.trim() || question.question
}

export function applyAskUserAnswers(input: Record<string, unknown>, answers: Readonly<Record<string, string | readonly string[]>>): Record<string, unknown> {
  const questions = parseAskQuestions(input)
  const cloned = cloneRecord(input, false)
  cloned['questions'] = questions.map(question => ({ question: question.question, ...(question.header === undefined ? {} : { header: question.header }), options: question.options.map(option => ({ ...option })), ...(question.multiSelect === undefined ? {} : { multiSelect: question.multiSelect }) }))
  const normalized: Record<string, string | readonly string[]> = {}
  for (const question of questions) {
    const answer = answers[canonicalQuestionKey(question)] ?? (question.header === undefined ? undefined : answers[question.header]) ?? answers[question.question]
    if (answer !== undefined) normalized[canonicalQuestionKey(question)] = Array.isArray(answer) ? [...answer] : answer
  }
  cloned['answers'] = normalized
  return cloned
}

export function askUserResponseToPermission(request: AskUserQuestionRequest, response: AskUserQuestionResponse): PermissionResponse {
  if (response.behavior === 'cancelled') return { behavior: 'deny', message: 'User cancelled the question' }
  return { behavior: 'allow', updatedInput: applyAskUserAnswers(request.input, response.answers) }
}

export interface PermissionRegistryOptions {
  readonly clock?: () => number
  readonly id?: () => string
  readonly timer?: TimerDriver
  readonly defaultTimeoutMs?: number
}
export interface PermissionBeginOptions { readonly signal?: AbortSignal; readonly timeoutMs?: number }
interface PendingEntry {
  readonly request: PermissionRequest
  readonly resolve: (response: PermissionResponse) => void
  readonly reject: (error: ControlError) => void
  readonly signal: AbortSignal | undefined
  readonly abortListener: (() => void) | undefined
  readonly timer: TimerHandle | undefined
  readonly deadline: number | undefined
}

const defaultTimer: TimerDriver = { setTimeout: (callback, delayMs) => setTimeout(callback, delayMs), clearTimeout: handle => clearTimeout(handle) }

export class PermissionRegistry {
  private readonly clock: () => number
  private readonly idFactory: () => string
  private readonly timer: TimerDriver
  private readonly defaultTimeoutMs: number | undefined
  private readonly entries = new Map<string, PendingEntry>()
  private readonly states = new Map<string, PermissionRegistryState>()

  constructor(options: PermissionRegistryOptions = {}) {
    this.clock = options.clock ?? (() => Date.now())
    this.idFactory = options.id ?? (() => `permission-${this.clock()}-${Math.random().toString(36).slice(2)}`)
    this.timer = options.timer ?? defaultTimer
    this.defaultTimeoutMs = options.defaultTimeoutMs
  }

  begin(request: PermissionRequest, options: PermissionBeginOptions = {}): Promise<PermissionResponse> {
    if (this.entries.has(request.requestId) || this.states.get(request.requestId) === 'pending') throw new ControlError('duplicate', `Request '${request.requestId}' is already pending`)
    if (options.signal?.aborted) {
      const error = new ControlError('canceled', `Request '${request.requestId}' was canceled`)
      this.states.set(request.requestId, 'canceled')
      return Promise.reject(error)
    }
    let resolvePromise!: (response: PermissionResponse) => void
    let rejectPromise!: (error: ControlError) => void
    const promise = new Promise<PermissionResponse>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject })
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs
    const deadline = timeoutMs === undefined ? undefined : this.clock() + timeoutMs
    const abortListener = options.signal === undefined ? undefined : () => { this.finishError(request.requestId, 'canceled', `Request '${request.requestId}' was canceled`) }
    const timer = timeoutMs === undefined ? undefined : this.timer.setTimeout(() => this.expireEntry(request.requestId), Math.max(0, timeoutMs))
    const entry: PendingEntry = {
      request,
      resolve: resolvePromise,
      reject: rejectPromise,
      signal: options.signal,
      abortListener,
      timer,
      deadline,
    }
    if (options.signal !== undefined && abortListener !== undefined) {
      options.signal.addEventListener('abort', abortListener, { once: true })
    }
    this.entries.set(request.requestId, entry)
    this.states.set(request.requestId, 'pending')
    return promise
  }

  respond(requestId: string, response: PermissionResponse): { readonly ok: true } | { readonly ok: false; readonly error: ControlError } {
    if (!this.entries.has(requestId)) return { ok: false, error: new ControlError(this.states.has(requestId) ? 'duplicate' : 'unknown', `No pending request '${requestId}'`) }
    this.finishResponse(requestId, response)
    return { ok: true }
  }

  cancel(requestId: string): { readonly ok: true } | { readonly ok: false; readonly error: ControlError } {
    if (!this.entries.has(requestId)) return { ok: false, error: new ControlError(this.states.has(requestId) ? 'duplicate' : 'unknown', `No pending request '${requestId}'`) }
    this.finishError(requestId, 'canceled', `Request '${requestId}' was canceled`)
    return { ok: true }
  }

  cancelAll(): readonly string[] {
    const ids = [...this.entries.keys()]
    for (const id of ids) this.finishError(id, 'canceled', `Request '${id}' was canceled`)
    return ids
  }

  expireDue(now = this.clock()): readonly string[] {
    const expired: string[] = []
    for (const [requestId, entry] of this.entries) {
      if (entry.deadline !== undefined && entry.deadline <= now) {
        expired.push(requestId)
        this.finishError(requestId, 'timeout', `Request '${requestId}' timed out`)
      }
    }
    return expired
  }

  stateOf(requestId: string): PermissionRegistryState { return this.states.get(requestId) ?? 'unknown' }
  pending(): readonly PermissionRequest[] { return [...this.entries.values()].map(entry => entry.request) }

  private expireEntry(requestId: string): void { if (this.entries.has(requestId)) this.finishError(requestId, 'timeout', `Request '${requestId}' timed out`) }

  private cleanup(requestId: string, entry: PendingEntry): void {
    this.entries.delete(requestId)
    if (entry.timer !== undefined) this.timer.clearTimeout(entry.timer)
    if (entry.signal !== undefined && entry.abortListener !== undefined) entry.signal.removeEventListener('abort', entry.abortListener)
  }

  private finishResponse(requestId: string, response: PermissionResponse): void {
    const entry = this.entries.get(requestId)
    if (entry === undefined) return
    this.cleanup(requestId, entry)
    this.states.set(requestId, 'resolved')
    entry.resolve(response)
  }

  private finishError(requestId: string, code: 'timeout' | 'canceled', message: string): void {
    const entry = this.entries.get(requestId)
    if (entry === undefined) return
    this.cleanup(requestId, entry)
    this.states.set(requestId, code === 'timeout' ? 'expired' : 'canceled')
    entry.reject(new ControlError(code, message))
  }
}

export interface NextTurnRequest<T> { readonly id: string; readonly value: T; readonly epoch: number; readonly version: number }
export type NextTurnOperation = { readonly ok: true } | { readonly ok: false; readonly error: ControlError }

function freezeClone<T>(value: T): T {
  if (Array.isArray(value)) {
    const copy = value.map(item => freezeClone(item))
    return Object.freeze(copy) as T
  }
  if (isObject(value)) {
    const copy: JsonObject = {}
    for (const [key, item] of Object.entries(value)) copy[key] = freezeClone(item)
    return Object.freeze(copy) as T
  }
  return value
}

export class NextTurnStateMachine<T> {
  private currentValue: T
  private pendingValue: NextTurnRequest<T> | undefined
  private epochValue = 0
  private versionValue = 0
  private readonly idFactory: () => string
  constructor(initial: T, options: { readonly id?: () => string } = {}) {
    this.currentValue = freezeClone(initial)
    this.idFactory = options.id ?? (() => `turn-${this.versionValue + 1}`)
  }
  get current(): T { return this.currentValue }
  get pending(): T | undefined { return this.pendingValue?.value }
  get epoch(): number { return this.epochValue }
  get version(): number { return this.versionValue }
  request(value: T): NextTurnRequest<T> {
    this.epochValue += 1
    this.versionValue += 1
    const request: NextTurnRequest<T> = { id: this.idFactory(), value: freezeClone(value), epoch: this.epochValue, version: this.versionValue }
    this.pendingValue = request
    return request
  }
  commit(request: NextTurnRequest<T>): NextTurnOperation {
    if (this.pendingValue?.id !== request.id || this.pendingValue.version !== request.version) return { ok: false, error: new ControlError('stale', 'The next-turn request is stale') }
    this.currentValue = request.value
    this.pendingValue = undefined
    return { ok: true }
  }
  rollback(request: NextTurnRequest<T>): NextTurnOperation {
    if (this.pendingValue?.id !== request.id || this.pendingValue.version !== request.version) return { ok: false, error: new ControlError('stale', 'The next-turn request is stale') }
    this.pendingValue = undefined
    return { ok: true }
  }
  snapshot(): { readonly current: T; readonly pending?: T; readonly epoch: number; readonly version: number; readonly request?: NextTurnRequest<T> } {
    return { current: this.currentValue, ...(this.pendingValue === undefined ? {} : { pending: this.pendingValue.value, request: this.pendingValue }), epoch: this.epochValue, version: this.versionValue }
  }
}
