import type { ClaudePermissionDecision, ClaudePermissionRequest } from './types.js';
export interface ClaudeApprovalServiceLike {
    request(request: {
        readonly agent: unknown;
        readonly toolName: string;
        readonly reason?: string;
    }): Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'>;
}
export interface ClaudeRequestHandlerOptions {
    readonly agent: () => unknown;
    readonly approval?: ClaudeApprovalServiceLike;
}
/** Maps Claude stream-json can_use_tool requests to the Harness approval seam. */
export declare function createClaudeControlRequestHandler(options: ClaudeRequestHandlerOptions): (request: ClaudePermissionRequest) => Promise<ClaudePermissionDecision>;
//# sourceMappingURL=requests.d.ts.map