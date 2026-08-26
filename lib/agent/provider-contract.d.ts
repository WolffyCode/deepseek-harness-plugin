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
} | {
    readonly type: "assistant_message";
    readonly text: string;
    readonly messageId?: string;
    /** True when text is an incremental provider chunk rather than a replayed final message. */
    readonly partial?: boolean;
} | {
    readonly type: "reasoning";
    readonly text: string;
} | {
    readonly type: "tool_call";
    readonly id: string;
    readonly name: string;
    readonly status: "running" | "completed" | "failed" | "canceled";
    readonly input?: unknown;
    readonly output?: unknown;
    readonly error?: string;
} | {
    readonly type: "todo";
    readonly items: readonly AgentTodoItem[];
} | {
    readonly type: "compaction";
    readonly status: "loading" | "completed";
    readonly trigger?: "auto" | "manual";
} | {
    readonly type: "error";
    readonly message: string;
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
} | {
    readonly type: "turn_started";
    readonly provider: AgentProvider;
    readonly turnId?: string;
} | {
    readonly type: "turn_completed";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly usage?: AgentUsage;
} | {
    readonly type: "turn_failed";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly error: string;
    readonly code?: string;
    readonly diagnostic?: string;
} | {
    readonly type: "turn_canceled";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly reason: string;
} | {
    readonly type: "timeline";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly item: AgentTimelineItem;
    readonly timestamp?: string;
} | {
    readonly type: "reasoning";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly text: string;
} | {
    readonly type: "usage_updated";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly usage: AgentUsage;
} | {
    readonly type: "permission_requested";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly request: AgentPermissionRequest;
} | {
    readonly type: "permission_resolved";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly requestId: string;
    readonly resolution: AgentPermissionResponse;
} | {
    readonly type: "mode_changed";
    readonly provider: AgentProvider;
    readonly currentModeId: string | null;
    readonly availableModes: readonly AgentMode[];
} | {
    readonly type: "model_changed";
    readonly provider: AgentProvider;
    readonly runtimeInfo: AgentRuntimeInfo;
} | {
    readonly type: "thinking_option_changed";
    readonly provider: AgentProvider;
    readonly thinkingOptionId: string | null;
} | {
    readonly type: "attention_required";
    readonly provider: AgentProvider;
    readonly reason: "finished" | "error" | "permission";
    readonly timestamp: string;
} | {
    readonly type: "provider_subagent";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly event: ProviderSubagentEvent;
} | {
    readonly type: "error";
    readonly provider: AgentProvider;
    readonly turnId?: string;
    readonly error: string;
    readonly code?: string;
};
export declare function getAgentStreamEventTurnId(event: AgentStreamEvent): string | undefined;
//# sourceMappingURL=provider-contract.d.ts.map