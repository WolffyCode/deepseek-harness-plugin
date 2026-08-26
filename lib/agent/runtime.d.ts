import type { JsonRpcLineTransport } from "../codex/json-rpc.js";
import type { AgentProvider, AgentStreamEvent } from "./provider-contract.js";
/** Opaque transport payload; the public stream vocabulary is AgentStreamEvent only. */
export type ExternalEngineEvent = unknown;
export type ExternalEngineEventHandler = (event: ExternalEngineEvent) => void;
/** Converts opaque CLI notifications and canonical events to AgentStreamEvent. */
export declare function normalizeExternalEngineEvent(value: unknown, provider: AgentProvider, fallbackTurnId?: string): AgentStreamEvent | undefined;
/** Runtime boundary used by the Harness bridge. */
export interface ExternalEngineRuntime {
    readonly transport?: Pick<JsonRpcLineTransport, "onNotification">;
    readonly process: {
        readonly exited: Promise<unknown>;
        readonly stderrTail: string;
    };
    readonly turnId: string | undefined;
    onEvent(handler: ExternalEngineEventHandler): () => void;
    /** Optional provider readiness gate; Claude exposes it to await SDK initialization. */
    whenReady?(): Promise<void>;
    startTurn(text: string, signal?: AbortSignal): Promise<{
        readonly id: string;
    }>;
    interrupt(signal?: AbortSignal): Promise<unknown>;
    close(): Promise<unknown>;
}
import type { ClaudeAgentSession } from "../claude/types.js";
export declare class ClaudeSessionRuntimeBridge implements ExternalEngineRuntime {
    readonly session: ClaudeAgentSession;
    readonly process: {
        exited: Promise<undefined>;
        stderrTail: string;
    };
    private readonly listeners;
    private readonly unsubscribe;
    private activeTurnId;
    private interruptTurnId;
    private interruptPromise;
    private closed;
    constructor(session: ClaudeAgentSession);
    get turnId(): string | undefined;
    whenReady(): Promise<void>;
    onEvent(handler: ExternalEngineEventHandler): () => void;
    startTurn(text: string, _signal?: AbortSignal): Promise<{
        readonly id: string;
    }>;
    interrupt(_signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
    private project;
    private timeline;
}
//# sourceMappingURL=runtime.d.ts.map