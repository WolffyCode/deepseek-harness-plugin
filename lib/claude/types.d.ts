import type { AgentDefinition, GetSessionInfoOptions, GetSessionMessagesOptions, ImportSessionToStoreOptions, ListSessionsOptions, McpServerConfig, Options as ClaudeSdkOptions, PermissionResult, PermissionUpdate, Query, SDKSessionInfo, SDKUserMessage, SessionMessage, SessionStore, SessionStoreFlush } from '@anthropic-ai/claude-agent-sdk';
import type { JsonValue } from '../codex/json-rpc.js';
import type { CanonicalMcpSet, ClaudeCredentialResolver } from './mcp.js';
import type { CanonicalSkillAssets } from './skills.js';
import type { SubagentObservation } from './subagents.js';
import type { ClaudeRewindSdk, RewindMode, RewindResult } from './rewind.js';
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
export type ClaudeThinkingOption = {
    readonly type: 'adaptive';
    readonly display?: 'summarized' | 'omitted';
} | {
    readonly type: 'enabled';
    readonly budgetTokens?: number;
    readonly display?: 'summarized' | 'omitted';
} | {
    readonly type: 'disabled';
};
export type ClaudePermissionDecision = {
    readonly behavior: 'allow';
    readonly updatedInput?: Record<string, unknown> | JsonValue;
    readonly updatedPermissions?: PermissionUpdate[];
    readonly toolUseID?: string;
    readonly decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject';
} | {
    readonly behavior: 'deny';
    readonly message: string;
    readonly interrupt?: boolean;
    readonly toolUseID?: string;
    readonly decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject';
};
/** SDK-native decisions are preferred; the broader decision shape preserves the existing host approval boundary. */
export type ClaudePermissionHandlerResult = PermissionResult | ClaudePermissionDecision;
export interface ClaudePermissionRequest {
    readonly requestId: string;
    readonly toolUseId?: string;
    readonly toolName: string;
    readonly input: Record<string, unknown>;
    readonly title?: string;
    readonly description?: string | undefined;
    readonly reason?: string;
    readonly signal: AbortSignal;
}
export interface ClaudeUserQuestionRequest {
    readonly requestId: string;
    readonly dialogKind: string;
    readonly payload: Record<string, unknown>;
    readonly toolUseId?: string;
    readonly signal: AbortSignal;
}
export type ClaudeUserQuestionResult = {
    readonly behavior: 'completed';
    readonly result: unknown;
} | {
    readonly behavior: 'cancelled';
};
export interface ClaudeTimelineItem {
    readonly type: 'user_message' | 'assistant_message' | 'reasoning' | 'tool_call' | 'tool_result' | 'subagent' | 'compaction' | 'status';
    readonly id?: string | undefined;
    readonly text?: string | undefined;
    readonly name?: string | undefined;
    readonly arguments?: string | undefined;
    readonly output?: string | undefined;
    readonly isError?: boolean | undefined;
    readonly partial?: boolean | undefined;
    readonly parentToolUseId?: string | null | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
}
export interface ClaudeUsage {
    readonly inputTokens?: number | undefined;
    readonly cachedInputTokens?: number | undefined;
    readonly outputTokens?: number | undefined;
    readonly totalCostUsd?: number | undefined;
    readonly contextWindowMaxTokens?: number | undefined;
    readonly contextWindowUsedTokens?: number | undefined;
}
export interface ClaudeCatalogModel {
    readonly id: string;
    readonly label?: string | undefined;
    readonly description?: string | undefined;
    readonly contextWindow?: number;
}
export interface ClaudeSlashCommand {
    readonly name: string;
    readonly description?: string | undefined;
    readonly argumentHint?: string | undefined;
    readonly source?: string | undefined;
}
export interface ClaudeMode {
    readonly id: string;
    readonly label: string;
    readonly description?: string | undefined;
}
export interface ClaudeSkill {
    readonly name: string;
    readonly description?: string | undefined;
}
export interface ClaudeMcpStatus {
    readonly name: string;
    readonly status: string;
}
export interface ClaudeCatalog {
    readonly model?: string | undefined;
    readonly models: readonly ClaudeCatalogModel[];
    readonly commands: readonly ClaudeSlashCommand[];
    readonly modes: readonly ClaudeMode[];
    readonly skills: readonly ClaudeSkill[];
    readonly mcpServers: readonly ClaudeMcpStatus[];
    readonly capabilities: readonly string[];
    readonly permissionMode?: string | undefined;
    readonly effort?: string | null | undefined;
}
export interface ClaudePersistenceHandle {
    readonly provider: 'claude-cli';
    readonly sessionId: string;
    readonly nativeHandle: string;
    readonly cwd: string;
    readonly runtimeRoot?: string | undefined;
    readonly forked?: boolean | undefined;
    readonly metadata?: Readonly<Record<string, JsonValue>> | undefined;
}
/** The SDK-native persistence surface available in claude-agent-sdk 0.3.246. */
export interface ClaudeSdkGateway {
    readonly capability: 'sdk-native';
    listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;
    getSessionInfo(sessionId: string, options?: GetSessionInfoOptions): Promise<SDKSessionInfo | undefined>;
    getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<SessionMessage[]>;
    importSessionToStore(sessionId: string, store: SessionStore, options?: ImportSessionToStoreOptions): Promise<void>;
}
export type ClaudeAdapterEvent = {
    readonly type: 'session_started';
    readonly sessionId: string;
    readonly catalog: ClaudeCatalog;
} | {
    readonly type: 'turn_started';
    readonly turnId: string;
    readonly sessionId?: string | undefined;
} | {
    readonly type: 'timeline';
    readonly turnId?: string | undefined;
    readonly item: ClaudeTimelineItem;
} | {
    readonly type: 'usage_updated';
    readonly turnId?: string | undefined;
    readonly usage: ClaudeUsage;
} | {
    readonly type: 'permission_requested';
    readonly request: ClaudePermissionRequest;
} | {
    readonly type: 'permission_resolved';
    readonly requestId: string;
    readonly decision: ClaudePermissionDecision;
} | {
    readonly type: 'user_question_requested';
    readonly request: ClaudeUserQuestionRequest;
} | {
    readonly type: 'user_question_resolved';
    readonly requestId: string;
    readonly result: ClaudeUserQuestionResult;
} | {
    readonly type: 'catalog_changed';
    readonly catalog: ClaudeCatalog;
} | {
    readonly type: 'status_changed';
    readonly status: string;
    readonly metadata?: Record<string, unknown> | undefined;
} | {
    readonly type: 'turn_completed';
    readonly turnId?: string | undefined;
    readonly usage?: ClaudeUsage | undefined;
    readonly result?: string | undefined;
} | {
    readonly type: 'turn_failed';
    readonly turnId?: string | undefined;
    readonly error: string;
} | {
    readonly type: 'turn_canceled';
    readonly turnId?: string | undefined;
} | {
    readonly type: 'process_exited';
    readonly error?: string | undefined;
} | {
    readonly type: 'provider_subagent';
    readonly event: SubagentObservation;
};
export type ClaudeInputMessage = SDKUserMessage;
export interface ClaudeQueryFactoryInput {
    readonly prompt: AsyncIterable<ClaudeInputMessage>;
    readonly options: ClaudeSdkOptions;
}
export type ClaudeQueryFactory = (input: ClaudeQueryFactoryInput) => Query;
export declare const claudeUserAgentDefinitionsBrand: unique symbol;
export interface ClaudeUserAgentDefinitions {
    readonly source: 'user';
    readonly definitions: Readonly<Record<string, AgentDefinition>>;
    readonly [claudeUserAgentDefinitionsBrand]: true;
}
export declare function createClaudeUserAgentDefinitions(definitions: Readonly<Record<string, AgentDefinition>>): ClaudeUserAgentDefinitions;
export declare function isClaudeUserAgentDefinitions(value: unknown): value is ClaudeUserAgentDefinitions;
export interface ClaudeAdapterOptions {
    readonly cwd: string;
    readonly model?: string | undefined;
    readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    readonly thinking?: ClaudeThinkingOption;
    readonly permissionMode?: ClaudePermissionMode;
    readonly baseUri?: string;
    readonly authToken?: string;
    readonly environment?: Readonly<Record<string, string | undefined>>;
    readonly executablePath?: string;
    readonly commandArgs?: readonly string[];
    /** Canonical user MCP assets; materialized into mcpServers exactly once at this boundary. */
    readonly mcpAssets?: CanonicalMcpSet;
    /** Canonical user Skill assets; materialized into plugins/additionalDirectories exactly once at this boundary. */
    readonly skillAssets?: CanonicalSkillAssets;
    readonly additionalDirectories?: readonly string[];
    readonly credentialResolver?: ClaudeCredentialResolver;
    /** Already-materialized SDK options supplied by the host integration boundary. */
    readonly mcpServers?: Readonly<Record<string, McpServerConfig>>;
    readonly skillPlugins?: readonly string[];
    readonly permissionTimeoutMs?: number;
    readonly userQuestionTimeoutMs?: number;
    readonly catalogTtlMs?: number;
    readonly supportedDialogKinds?: readonly string[];
    readonly rewindSdk?: ClaudeRewindSdk;
    readonly agents?: ClaudeUserAgentDefinitions;
    readonly sessionId?: string | undefined;
    readonly resumeSessionId?: string;
    readonly forkSession?: boolean;
    readonly persistSession?: boolean;
    /** Optional SDK SessionStore supplied by the host for transcript mirroring/import. */
    readonly sessionStore?: SessionStore;
    readonly sessionStoreFlush?: SessionStoreFlush;
    /** Native SDK persistence gateway; the real 0.3.246 gateway is used by default. */
    readonly persistenceGateway?: ClaudeSdkGateway;
    readonly queryFactory?: ClaudeQueryFactory;
    readonly defaultPermission?: PermissionResult;
    readonly permissionHandler?: (request: ClaudePermissionRequest) => Promise<ClaudePermissionHandlerResult>;
}
export interface ClaudeRewindRequest {
    readonly mode: RewindMode;
    readonly messageId: string;
    readonly dryRun?: boolean;
    readonly resolveMessageId?: (messageId: string) => string | Promise<string>;
}
export type ClaudeRewindResult = RewindResult;
export interface ClaudeRunResult {
    readonly sessionId?: string | undefined;
    readonly turnId: string;
    readonly finalText: string;
    readonly usage?: ClaudeUsage | undefined;
}
export interface ClaudeAgentSession {
    readonly sessionId: string | undefined;
    readonly capabilities: Readonly<Record<string, boolean>>;
    readonly catalog: ClaudeCatalog;
    subscribe(listener: (event: ClaudeAdapterEvent) => void): () => void;
    startTurn(prompt: string, options?: {
        readonly clientMessageId?: string;
    }): Promise<{
        readonly turnId: string;
    }>;
    run(prompt: string, options?: {
        readonly clientMessageId?: string;
    }): Promise<ClaudeRunResult>;
    interrupt(): Promise<void>;
    close(): Promise<void>;
    setMode(mode: string): Promise<void>;
    setModel(model?: string): Promise<void>;
    setThinking(thinking: ClaudeThinkingOption): Promise<void>;
    setPermissionMode(mode: ClaudePermissionMode): Promise<void>;
    respondToPermission(requestId: string, decision: ClaudePermissionDecision): boolean;
    respondToUserQuestion(requestId: string, result: ClaudeUserQuestionResult): boolean;
    pendingPermissions(): readonly ClaudePermissionRequest[];
    persistenceHandle(): ClaudePersistenceHandle | undefined;
    listCommands(): readonly ClaudeSlashCommand[];
    refreshCatalog(): Promise<ClaudeCatalog>;
    steer(prompt: string): Promise<{
        readonly status: 'accepted' | 'unavailable';
    }>;
    rewind?(input: ClaudeRewindRequest): Promise<ClaudeRewindResult>;
    /** Reads native Claude history using the persisted cwd and native handle. */
    history?(options?: Pick<GetSessionMessagesOptions, 'limit' | 'offset' | 'includeSystemMessages' | 'sessionStore'>): Promise<readonly SessionMessage[]>;
    /** Creates a new ProviderSession and resumes this native conversation after reconnect. */
    reconnect?(): Promise<ClaudeAgentSession>;
    /** Resolves only after the SDK has returned initialization and a real system/init session id was observed. */
    whenReady?: () => Promise<void>;
}
export interface ClaudeProviderClient {
    readonly engineId: 'claude-cli';
    createSession(options: ClaudeAdapterOptions): ClaudeAgentSession;
    resumeSession(options: ClaudeAdapterOptions & {
        readonly resumeSessionId: string;
    }): ClaudeAgentSession;
    isAvailable(): Promise<boolean>;
}
//# sourceMappingURL=types.d.ts.map