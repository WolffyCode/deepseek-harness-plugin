import { CallId } from '@deepseek-ai/dsh-llm'
import type { JsonObject, JsonRpcRequestHandler, JsonValue } from './json-rpc.js'

export type CodexApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

export interface CodexApprovalServiceLike {
  request(request: {
    readonly agent: unknown
    readonly toolName: string
    readonly reason?: string
  }): Promise<CodexApprovalOutcome>
}

export interface CodexRequestHandlerOptions {
  readonly agent: () => unknown
  readonly approval?: CodexApprovalServiceLike
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function decisions(params: JsonObject | undefined): readonly string[] {
  const value = params?.['availableDecisions']
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function decline(params: JsonObject | undefined): string {
  const available = decisions(params)
  return available.includes('cancel') ? 'cancel' : 'decline'
}

function accept(params: JsonObject | undefined): string {
  const available = decisions(params)
  if (available.includes('accept')) return 'accept'
  if (available.includes('acceptForSession')) return 'acceptForSession'
  return decline(params)
}

function callIdOf(params: JsonObject | undefined): ReturnType<typeof CallId> | undefined {
  const value = params?.['itemId']
  return typeof value === 'string' && value.length > 0 ? CallId(value) : undefined
}

function reasonOf(params: JsonObject | undefined): string | undefined {
  const reason = params?.['reason']
  return typeof reason === 'string' && reason.length > 0 ? reason : undefined
}

/** Bridges Codex app-server requests into the host's approval seam without exposing CLI credentials. */
export function createCodexServerRequestHandler(options: CodexRequestHandlerOptions): JsonRpcRequestHandler {
  return async (method, rawParams): Promise<JsonValue> => {
    const params = object(rawParams)
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      const agent = options.agent()
      if (options.approval === undefined || agent === undefined) return { decision: decline(params) }
      const reason = reasonOf(params)
      const callId = callIdOf(params)
      const outcome = await options.approval.request({
        agent,
        toolName: method === 'item/fileChange/requestApproval' ? 'file_change' : 'command_execution',
        ...callId === undefined ? {} : { callId },
        ...reason === undefined ? {} : { reason },
      })
      return { decision: outcome === 'allowed-once' ? accept(params) : outcome === 'cancelled' ? 'cancel' : decline(params) }
    }
    if (method === 'item/permissions/requestApproval') return { permissions: {}, scope: 'turn' }
    if (method === 'item/tool/requestUserInput') return { answers: {} }
    if (method === 'mcpServer/elicitation/request') return { action: 'decline', content: null, _meta: null }
    throw new Error(`unsupported Codex app-server request: ${method}`)
  }
}
