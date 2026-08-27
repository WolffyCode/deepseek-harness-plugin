import type { AgentPromptInput, AgentProvider, AgentRunOptions, AgentRunResult, AgentSessionStateSnapshot, AgentStreamEvent, AgentTimelineItem, AgentTurnState } from "./provider-contract.js";
export type AgentEventListener = (event: AgentStreamEvent) => void;
export type AgentStream = Pick<{
    subscribe(listener: AgentEventListener): () => void;
    streamHistory(): AsyncGenerator<AgentStreamEvent>;
}, "subscribe" | "streamHistory">;
export declare function getAgentStreamEventTurnId(event: AgentStreamEvent): string | undefined;
export declare function isTerminalAgentStreamEvent(event: AgentStreamEvent): boolean;
export declare class ConcurrentTurnError extends Error {
    readonly code = "CONCURRENT_TURN";
    constructor(message?: string);
}
export declare class AgentSessionStateError extends Error {
    readonly code = "INVALID_SESSION_STATE";
    constructor(message: string);
}
/**
 * Small provider-independent turn state machine. Providers may own a coordinator
 * and pass it to runProviderTurn so concurrent starts are rejected before a
 * second process request can be sent.
 */
export declare class AgentTurnCoordinator {
    private active;
    get state(): AgentTurnState;
    get activeTurnId(): string | null;
    begin(): void;
    bind(turnId: string): void;
    markInterrupting(): void;
    finish(): void;
}
export type ProviderFinalTextReducer = (params: {
    readonly current: string;
    readonly item: AgentTimelineItem;
}) => string;
export interface ProviderTurnRunner {
    startTurn(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<{
        readonly turnId: string;
    }>;
    subscribe(listener: AgentEventListener): () => void;
    getSessionId(): string | Promise<string>;
    readonly provider?: AgentProvider;
    readonly coordinator?: AgentTurnCoordinator;
    readonly getState?: () => AgentSessionStateSnapshot;
    interrupt?(): Promise<void>;
}
export interface RunProviderTurnOptions extends ProviderTurnRunner {
    readonly prompt: AgentPromptInput;
    readonly runOptions?: AgentRunOptions;
    readonly reduceFinalText?: ProviderFinalTextReducer;
}
/**
 * Runs one provider turn with the provider ordering contract:
 * subscribe first, start second, then bind and replay buffered events.
 *
 * Events without a turn id are accepted while the turn is live. An unscoped
 * terminal/error event observed before startTurn returns is deliberately not
 * allowed to settle the new turn because its ownership cannot be proven.
 */
export declare function runProviderTurn({ prompt, runOptions, startTurn, subscribe, getSessionId, provider, coordinator, getState, interrupt, reduceFinalText, }: RunProviderTurnOptions): Promise<AgentRunResult>;
export declare function replaceFinalTextWithAssistantMessage({ current, item, }: {
    readonly current: string;
    readonly item: AgentTimelineItem;
}): string;
export declare function appendOrReplaceGrowingAssistantMessage({ current, item, }: {
    readonly current: string;
    readonly item: AgentTimelineItem;
}): string;
//# sourceMappingURL=stream-events.d.ts.map