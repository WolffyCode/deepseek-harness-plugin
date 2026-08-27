import { CallId } from '@deepseek-ai/dsh-llm';
import type { JsonObject, JsonRpcRequestHandler } from './json-rpc.js';
export type CodexApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
export type CodexApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';
export interface CodexApprovalRequest {
    readonly agent: unknown;
    readonly toolName: string;
    readonly requestId?: string | number;
    readonly itemId?: string;
    readonly callId?: ReturnType<typeof CallId>;
    readonly threadId?: string;
    readonly turnId?: string;
    readonly reason?: string;
    readonly context?: JsonObject;
}
export interface CodexApprovalServiceLike {
    request(request: CodexApprovalRequest): Promise<CodexApprovalOutcome>;
}
export interface CodexRequestHandlerOptions {
    readonly agent: () => unknown;
    readonly approval?: CodexApprovalServiceLike;
}
interface CodexApprovalUnavailableDetails {
    readonly method: string;
    readonly toolName: string;
    readonly itemId?: string;
    readonly threadId?: string;
    readonly turnId?: string;
}
export declare class CodexApprovalUnavailableError extends Error {
    readonly code = "CODEX_APPROVAL_UNAVAILABLE";
    readonly method: string;
    readonly toolName: string;
    readonly itemId?: string;
    readonly threadId?: string;
    readonly turnId?: string;
    constructor(request: CodexApprovalUnavailableDetails);
}
export declare class CodexUnsupportedServerRequestError extends Error {
    readonly code = "CODEX_UNSUPPORTED_SERVER_REQUEST";
    readonly method: string;
    constructor(method: string);
}
/** Bridges Codex app-server requests into the host's approval seam without exposing CLI credentials. */
export declare function createCodexServerRequestHandler(options: CodexRequestHandlerOptions): JsonRpcRequestHandler;
export {};
//# sourceMappingURL=requests.d.ts.map