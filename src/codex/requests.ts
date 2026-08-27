import { CallId } from '@deepseek-ai/dsh-llm'
import type { JsonObject, JsonRpcRequestHandler, JsonValue } from './json-rpc.js'

export type CodexApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
export type CodexApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'

export interface CodexApprovalRequest {
  readonly agent: unknown
  readonly toolName: string
  readonly requestId?: string | number
  readonly itemId?: string
  readonly callId?: ReturnType<typeof CallId>
  readonly threadId?: string
  readonly turnId?: string
  readonly reason?: string
  readonly context?: JsonObject
}

export interface CodexApprovalServiceLike {
  request(request: CodexApprovalRequest): Promise<CodexApprovalOutcome>
}

export interface CodexRequestHandlerOptions {
  readonly agent: () => unknown
  readonly approval?: CodexApprovalServiceLike
}

interface CodexApprovalUnavailableDetails {
  readonly method: string
  readonly toolName: string
  readonly itemId?: string
  readonly threadId?: string
  readonly turnId?: string
}

export class CodexApprovalUnavailableError extends Error {
  readonly code = 'CODEX_APPROVAL_UNAVAILABLE'
  readonly method: string
  readonly toolName: string
  readonly itemId?: string
  readonly threadId?: string
  readonly turnId?: string

  constructor(request: CodexApprovalUnavailableDetails) {
    const scope = request.itemId === undefined ? '' : ` for item ${request.itemId}`
    super(`Codex ${request.toolName} approval is unavailable${scope}`)
    this.name = 'CodexApprovalUnavailableError'
    this.method = request.method
    this.toolName = request.toolName
    if (request.itemId !== undefined) this.itemId = request.itemId
    if (request.threadId !== undefined) this.threadId = request.threadId
    if (request.turnId !== undefined) this.turnId = request.turnId
  }
}

export class CodexUnsupportedServerRequestError extends Error {
  readonly code = 'CODEX_UNSUPPORTED_SERVER_REQUEST'
  readonly method: string

  constructor(method: string) {
    super(`unsupported Codex app-server request: ${method}`)
    this.name = 'CodexUnsupportedServerRequestError'
    this.method = method
  }
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function stringField(params: JsonObject | undefined, key: string): string | undefined {
  const value = params?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function identifierField(params: JsonObject | undefined, key: string): string | number | undefined {
  const value = params?.[key]
  return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value)) ? value : undefined
}

function decisions(params: JsonObject | undefined): readonly string[] {
  const value = params?.['availableDecisions']
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function declineDecision(params: JsonObject | undefined): CodexApprovalDecision {
  const available = decisions(params)
  if (available.length === 0 || available.includes('decline')) return 'decline'
  if (available.includes('cancel')) return 'cancel'
  return 'decline'
}

function acceptDecision(params: JsonObject | undefined): CodexApprovalDecision {
  const available = decisions(params)
  if (available.length === 0 || available.includes('accept')) return 'accept'
  if (available.includes('acceptForSession')) return 'acceptForSession'
  // An approval outcome cannot be represented by an unavailable accept choice.
  // Decline is the only non-approving V2 decision that is safe to send here.
  return 'decline'
}

function cancelDecision(params: JsonObject | undefined): CodexApprovalDecision {
  const available = decisions(params)
  if (available.length === 0 || available.includes('cancel')) return 'cancel'
  return declineDecision(params)
}

function contextOf(method: string, params: JsonObject | undefined): JsonObject | undefined {
  if (params === undefined) return undefined
  const fields = method === 'item/commandExecution/requestApproval'
    ? [
        'command',
        'cwd',
        'commandActions',
        'kind',
        'approvalId',
        'environmentId',
        'networkApprovalContext',
        'additionalPermissions',
        'proposedExecpolicyAmendment',
        'proposedNetworkPolicyAmendments',
      ]
    : [
        'grantRoot',
        'fileChanges',
        'changes',
        'path',
        'paths',
      ]
  const context: Record<string, JsonValue> = {}
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(params, field)) context[field] = params[field]!
  }
  return Object.keys(context).length === 0 ? undefined : context
}

function approvalRequest(
  method: string,
  agent: unknown,
  params: JsonObject | undefined,
): CodexApprovalRequest {
  const itemId = stringField(params, 'itemId')
  const requestId = identifierField(params, 'requestId')
  const threadId = stringField(params, 'threadId')
  const turnId = stringField(params, 'turnId')
  const reason = stringField(params, 'reason')
  const context = contextOf(method, params)
  const request: CodexApprovalRequest = {
    agent,
    toolName: method === 'item/fileChange/requestApproval' ? 'file_change' : 'command_execution',
    ...requestId === undefined ? {} : { requestId },
    ...itemId === undefined ? {} : { itemId, callId: CallId(itemId) },
    ...threadId === undefined ? {} : { threadId },
    ...turnId === undefined ? {} : { turnId },
    ...reason === undefined ? {} : { reason },
    ...context === undefined ? {} : { context },
  }
  return request
}

function unavailable(method: string, request: CodexApprovalRequest): CodexApprovalUnavailableError {
  return new CodexApprovalUnavailableError({
    method,
    toolName: request.toolName,
    ...request.itemId === undefined ? {} : { itemId: request.itemId },
    ...request.threadId === undefined ? {} : { threadId: request.threadId },
    ...request.turnId === undefined ? {} : { turnId: request.turnId },
  })
}

/** Bridges Codex app-server requests into the host's approval seam without exposing CLI credentials. */
export function createCodexServerRequestHandler(options: CodexRequestHandlerOptions): JsonRpcRequestHandler {
  return async (method, rawParams): Promise<JsonValue> => {
    const params = object(rawParams)
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      const agent = options.agent()
      const request = approvalRequest(method, agent, params)
      if (options.approval === undefined || agent === undefined) throw unavailable(method, request)

      const outcome = await options.approval.request(request)
      if (outcome === 'allowed-once') return { decision: acceptDecision(params) }
      if (outcome === 'rejected') return { decision: declineDecision(params) }
      if (outcome === 'cancelled') return { decision: cancelDecision(params) }
      if (outcome === 'unavailable') throw unavailable(method, request)
      throw new Error(`invalid Codex approval outcome for ${method}`)
    }
    if (method === 'item/permissions/requestApproval') return { permissions: {}, scope: 'turn' }
    if (method === 'item/tool/requestUserInput') return { answers: {} }
    if (method === 'mcpServer/elicitation/request') return { action: 'decline', content: null, _meta: null }
    throw new CodexUnsupportedServerRequestError(method)
  }
}
