import type { JsonValue } from '../codex/json-rpc.js'
import type { ClaudePermissionDecision, ClaudePermissionRequest } from './types.js'

export interface ClaudeApprovalServiceLike {
  request(request: {
    readonly agent: unknown
    readonly toolName: string
    readonly reason?: string
  }): Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'>
}

export interface ClaudeRequestHandlerOptions {
  readonly agent: () => unknown
  readonly approval?: ClaudeApprovalServiceLike
}

/** Maps Claude stream-json can_use_tool requests to the Harness approval seam. */
export function createClaudeControlRequestHandler(options: ClaudeRequestHandlerOptions): (request: ClaudePermissionRequest) => Promise<ClaudePermissionDecision> {
  return async request => {
    const agent = options.agent()
    if (options.approval === undefined || agent === undefined) {
      return { behavior: 'deny', message: 'No Harness approval service is available' }
    }
    const outcome = await options.approval.request({
      agent,
      toolName: request.toolName,
      ...request.reason === undefined ? {} : { reason: request.reason },
    })
    if (outcome === 'allowed-once') return { behavior: 'allow', updatedInput: request.input as JsonValue }
    return { behavior: 'deny', message: outcome === 'cancelled' ? 'User cancelled this tool request' : 'User rejected this tool request' }
  }
}
