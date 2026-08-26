import type { JsonRpcRequestHandler } from './json-rpc.js';
export type CodexApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
export interface CodexApprovalServiceLike {
    request(request: {
        readonly agent: unknown;
        readonly toolName: string;
        readonly reason?: string;
    }): Promise<CodexApprovalOutcome>;
}
export interface CodexRequestHandlerOptions {
    readonly agent: () => unknown;
    readonly approval?: CodexApprovalServiceLike;
}
/** Bridges Codex app-server requests into the host's approval seam without exposing CLI credentials. */
export declare function createCodexServerRequestHandler(options: CodexRequestHandlerOptions): JsonRpcRequestHandler;
//# sourceMappingURL=requests.d.ts.map