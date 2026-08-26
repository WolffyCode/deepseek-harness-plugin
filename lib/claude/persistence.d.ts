import { type SDKSessionInfo, type SessionMessage, type SessionStore } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudePersistenceHandle, ClaudeSdkGateway } from './types.js';
/** Version of the serialized plugin persistence envelope. */
export declare const CLAUDE_PERSISTENCE_VERSION: 1;
export type { ClaudePersistenceHandle, ClaudeSdkGateway } from './types.js';
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export type ClaudePersistedPersistenceHandle = ClaudePersistenceHandle & {
    readonly version: typeof CLAUDE_PERSISTENCE_VERSION;
};
/** Validates and copies a provider handle before it crosses a persistence boundary. */
export declare function normalizeClaudePersistenceHandle(input: ClaudePersistenceHandle): ClaudePersistenceHandle;
/** Creates the plain native handle used by ProviderSession and Engine Suite APIs. */
export declare function createClaudePersistenceHandle(input: Omit<ClaudePersistenceHandle, 'provider'>): ClaudePersistenceHandle;
/** Serializes a handle as a stable, secret-free versioned JSON envelope. */
export declare function serializeClaudePersistenceHandle(handle: ClaudePersistenceHandle): string;
/** Parses and validates the serialized persistence envelope into a plain native handle. */
export declare function parseClaudePersistenceHandle(input: string): ClaudePersistenceHandle;
export type ClaudePersistenceCapability = 'session-list' | 'session-history' | 'session-import' | 'session-resume' | 'session-reconnect' | 'session-archive';
export declare class ClaudeCapabilityError extends Error {
    readonly capability: ClaudePersistenceCapability;
    readonly code: "CLAUDE_CAPABILITY_UNAVAILABLE";
    constructor(capability: ClaudePersistenceCapability, message: string);
}
export declare const realClaudeSdkGateway: ClaudeSdkGateway;
export interface ClaudeSessionDescriptor extends SDKSessionInfo {
    readonly provider: 'claude-cli';
    readonly nativeSessionId: string;
}
export interface ListClaudeSessionsInput {
    readonly cwd?: string;
    readonly limit?: number;
    readonly offset?: number;
}
export declare function listClaudeSessionDescriptors(gateway: Pick<ClaudeSdkGateway, 'listSessions'>, input?: ListClaudeSessionsInput): Promise<ClaudeSessionDescriptor[]>;
export declare function normalizeClaudeSessionDescriptor(session: SDKSessionInfo): ClaudeSessionDescriptor;
export interface ClaudeSessionHistoryOptions {
    readonly limit?: number;
    readonly offset?: number;
    readonly includeSystemMessages?: boolean;
    readonly sessionStore?: SessionStore;
}
export declare function getClaudeSessionHistory(gateway: Pick<ClaudeSdkGateway, 'getSessionMessages'>, handle: ClaudePersistenceHandle, input?: ClaudeSessionHistoryOptions): Promise<SessionMessage[]>;
export interface ClaudeImportSessionInput {
    readonly handle: ClaudePersistenceHandle;
    readonly store?: SessionStore;
    readonly includeSubagents?: boolean;
    readonly batchSize?: number;
}
export interface ClaudeImportedSession {
    readonly handle: ClaudePersistenceHandle;
    readonly descriptor?: ClaudeSessionDescriptor;
    readonly history: readonly SessionMessage[];
}
export declare function importClaudeSessionToStore(gateway: ClaudeSdkGateway, input: ClaudeImportSessionInput): Promise<ClaudeImportedSession>;
export declare class ClaudeArchiveNotFoundError extends Error {
    constructor(sessionId: string);
}
export interface ClaudeArchiveState {
    readonly handle: ClaudePersistenceHandle;
    readonly archivedAt: string;
}
export interface ClaudeArchiveStore {
    remember(handle: ClaudePersistenceHandle): void;
    archive(handle: ClaudePersistenceHandle, at?: string): ClaudeArchiveState;
    unarchive(handle: ClaudePersistenceHandle): boolean;
    get(handle: ClaudePersistenceHandle): ClaudeArchiveState | undefined;
    list(): ClaudeArchiveState[];
    serialize(): string;
}
/** Plugin-owned archive metadata. Claude SDK has no archive operation, so this store never calls one. */
export declare function createClaudeArchiveStore(initialHandles?: readonly ClaudePersistenceHandle[]): ClaudeArchiveStore;
//# sourceMappingURL=persistence.d.ts.map