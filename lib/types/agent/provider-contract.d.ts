/** Provider-neutral capability flags exposed by an Agent adapter. */
export interface ProviderCapabilities {
    readonly supportsStreaming: boolean;
    readonly supportsSessionPersistence: boolean;
    readonly supportsDynamicModes: boolean;
    readonly supportsMcpServers: boolean;
    readonly supportsReasoningStream: boolean;
    readonly supportsToolInvocations: boolean;
    readonly supportsSessionListing?: boolean;
    readonly supportsNativeTools?: boolean;
    readonly supportsModelSelection?: boolean;
    readonly supportsThinkingOptions?: boolean;
    readonly supportsPermissions?: boolean;
    readonly supportsCommands?: boolean;
    readonly supportsRewindConversation?: boolean;
    readonly supportsRewindFiles?: boolean;
    readonly supportsRewindBoth?: boolean;
}
export type AgentProvider = string;
export type AgentMetadata = Readonly<Record<string, unknown>>;
export type AgentToolKind = "command" | "file" | "mcp" | "dynamic" | "web" | "computer" | "other";
export interface AgentToolMetadata {
    readonly kind: AgentToolKind;
    readonly name?: string;
    readonly command?: string;
    readonly cwd?: string;
    readonly outputDelta?: string;
}
export interface AgentFileMetadata {
    readonly paths?: readonly string[];
    readonly changes?: unknown;
    readonly patch?: unknown;
    readonly outputDelta?: string;
}
export interface AgentMcpMetadata {
    readonly server?: string;
    readonly tool?: string;
    readonly progress?: unknown;
}
export interface AgentReasoningMetadata {
    readonly stream?: "text" | "summary";
    readonly contentIndex?: number;
    readonly summaryIndex?: number;
}
export interface AgentUsageCounter {
    readonly inputTokens?: number;
    readonly cachedInputTokens?: number;
    readonly outputTokens?: number;
    readonly reasoningTokens?: number;
    readonly totalTokens?: number;
}
/** Provider-neutral usage counters. `turn` is the most recent turn/segment. */
export interface AgentUsageBreakdown {
    readonly total?: AgentUsageCounter;
    readonly turn?: AgentUsageCounter;
}
export interface AgentStructuredError {
    readonly message: string;
    readonly code?: string;
    readonly diagnostic?: string;
    readonly details?: AgentMetadata;
}
export type AgentServerRequestKind = "command_approval" | "file_approval" | "permission" | "user_input" | "elicitation";
export interface AgentServerRequest {
    readonly id?: string | number;
    readonly kind: AgentServerRequestKind;
    readonly toolName?: string;
    readonly input?: AgentMetadata;
}
/** Stable metadata shared by external engines; provider protocol names do not belong here. */
export interface AgentEventMetadata extends AgentMetadata {
    readonly tool?: AgentToolMetadata;
    readonly file?: AgentFileMetadata;
    readonly mcp?: AgentMcpMetadata;
    readonly reasoning?: AgentReasoningMetadata;
    readonly error?: AgentStructuredError;
    readonly serverRequest?: AgentServerRequest;
}
export interface AgentPersistenceHandle {
    readonly provider: AgentProvider;
    readonly sessionId: string;
    /** Provider-specific native handle, such as a Claude session or Codex thread id. */
    readonly nativeHandle?: string;
    readonly metadata?: AgentMetadata;
}
export type AgentPromptBlock = {
    readonly type: "text";
    readonly text: string;
} | {
    readonly type: "image";
    readonly data: string;
    readonly mimeType: string;
};
export type AgentPromptInput = string | readonly AgentPromptBlock[];
export interface AgentRunOptions {
    readonly clientMessageId?: string;
    readonly maxThinkingTokens?: number;
    readonly resumeFrom?: AgentPersistenceHandle;
    readonly signal?: AbortSignal;
}
export interface AgentUsage {
    readonly inputTokens?: number;
    readonly cachedInputTokens?: number;
    readonly outputTokens?: number;
    readonly totalCostUsd?: number;
    readonly contextWindowMaxTokens?: number;
    readonly contextWindowUsedTokens?: number;
    readonly breakdown?: AgentUsageBreakdown;
}
export interface AgentRuntimeInfo {
    readonly provider: AgentProvider;
    readonly sessionId: string | null;
    readonly model?: string | null;
    readonly modeId?: string | null;
    readonly thinkingOptionId?: string | null;
    readonly extra?: AgentMetadata;
}
export type AgentSessionState = "new" | "ready" | "closing" | "closed" | "failed";
export type AgentTurnState = "idle" | "starting" | "running" | "interrupting" | "completed" | "failed" | "canceled";
/** Immutable lifecycle snapshot. A session has at most one active turn. */
export interface AgentSessionStateSnapshot {
    readonly session: AgentSessionState;
    readonly turn: AgentTurnState;
    readonly activeTurnId: string | null;
}
export interface AgentPermissionRequest {
    readonly id: string;
    readonly kind: "tool" | "plan" | "question" | "mode" | "other";
    readonly name: string;
    readonly title?: string;
    readonly description?: string;
    readonly input?: AgentMetadata;
}
export type AgentPermissionResponse = {
    readonly behavior: "allow";
    readonly selectedActionId?: string;
    readonly updatedInput?: AgentMetadata;
    readonly updatedPermissions?: readonly AgentMetadata[];
} | {
    readonly behavior: "deny";
    readonly selectedActionId?: string;
    readonly message?: string;
    readonly interrupt?: boolean;
};
export interface AgentPermissions {
    readonly pending: readonly AgentPermissionRequest[];
    respond(requestId: string, response: AgentPermissionResponse): Promise<void>;
}
export interface AgentCommand {
    readonly name: string;
    readonly description: string;
    readonly argumentHint?: string;
    readonly kind?: "command" | "skill";
}
export interface AgentRunResult {
    readonly sessionId: string;
    readonly finalText: string;
    readonly timeline: readonly AgentTimelineItem[];
    readonly usage?: AgentUsage;
    readonly canceled?: boolean;
}
export interface AgentSession {
    readonly provider: AgentProvider;
    readonly persistence: AgentPersistenceHandle;
    readonly capabilities: ProviderCapabilities;
    readonly permissions: AgentPermissions;
    readonly commands: readonly AgentCommand[];
    readonly state: AgentSessionState;
    readonly turnState: AgentTurnState;
    readonly activeTurnId: string | null;
    /** Rejects while another turn is starting/running/interrupting or the session is closing/closed. */
    run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult>;
    /** Must establish the active turn id before emitting unscoped terminal events. */
    startTurn(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<{
        readonly turnId: string;
    }>;
    subscribe(listener: (event: AgentStreamEvent) => void): () => void;
    streamHistory(): AsyncGenerator<AgentStreamEvent>;
    /** Idempotent. A repeated call must not create another interrupt request. */
    interrupt(): Promise<void>;
    /** Idempotent. A repeated call must not resurrect or re-close the session. */
    close(): Promise<void>;
    setMode(modeId: string | null): Promise<void>;
    setModel(modelId: string | null): Promise<void>;
    setThinkingOption(thinkingOptionId: string | null): Promise<void>;
}
export type AgentTimelineItem = {
    readonly type: "user_message";
    readonly text: string;
    readonly messageId?: string;
    readonly clientMessageId?: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "assistant_message";
    readonly text: string;
    readonly messageId?: string;
    /** True when text is an incremental provider chunk rather than a replayed final message. */
    readonly partial?: boolean;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "reasoning";
    readonly text: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "tool_call";
    readonly id: string;
    readonly name: string;
    readonly status: "running" | "completed" | "failed" | "canceled";
    readonly input?: unknown;
    readonly output?: unknown;
    readonly error?: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "todo";
    readonly items: readonly AgentTodoItem[];
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "compaction";
    readonly status: "loading" | "completed";
    readonly trigger?: "auto" | "manual";
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "error";
    readonly message: string;
    readonly metadata?: AgentEventMetadata;
};
export interface AgentTodoItem {
    readonly id: string;
    readonly title: string;
    readonly status: "pending" | "in_progress" | "completed" | "failed";
    readonly detail?: string;
}
export interface AgentMode {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
}
export interface AgentModel {
    readonly id: string;
    readonly label?: string;
    readonly aliases?: readonly string[];
}
export interface AgentThinkingOption {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
}
export type AgentSubagentStatus = "started" | "updated" | "completed" | "failed" | "canceled";
export interface ProviderSubagentEvent {
    readonly subagentId: string;
    readonly status: AgentSubagentStatus;
    readonly text?: string;
    readonly item?: AgentTimelineItem;
    readonly metadata?: AgentMetadata;
}
/**
 * The only public stream vocabulary shared by providers.
 * Provider-specific payloads belong in metadata on the relevant item/event.
 */
export type AgentStreamEvent = {
    readonly type: "thread_started";
    readonly provider: AgentProvider;
    readonly sessionId: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "turn_started";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "turn_completed";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly usage?: AgentUsage;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "turn_failed";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly error: string;
    readonly code?: string;
    readonly diagnostic?: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "turn_canceled";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly reason: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "timeline";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly item: AgentTimelineItem;
    readonly timestamp?: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "reasoning";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly text: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "usage_updated";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly usage: AgentUsage;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "permission_requested";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly request: AgentPermissionRequest;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "permission_resolved";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly requestId: string;
    readonly resolution: AgentPermissionResponse;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "mode_changed";
    readonly provider: AgentProvider;
    readonly currentModeId: string | null;
    readonly availableModes: readonly AgentMode[];
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "model_changed";
    readonly provider: AgentProvider;
    readonly runtimeInfo: AgentRuntimeInfo;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "thinking_option_changed";
    readonly provider: AgentProvider;
    readonly thinkingOptionId: string | null;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "attention_required";
    readonly provider: AgentProvider;
    readonly reason: "finished" | "error" | "permission";
    readonly timestamp: string;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "provider_subagent";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly event: ProviderSubagentEvent;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "server_request";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly request: AgentServerRequest;
    readonly metadata?: AgentEventMetadata;
} | {
    readonly type: "error";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly error: string;
    readonly code?: string;
    readonly metadata?: AgentEventMetadata;
};
export declare function getAgentStreamEventTurnId(event: AgentStreamEvent): string | undefined;
//# sourceMappingURL=provider-contract.d.ts.map