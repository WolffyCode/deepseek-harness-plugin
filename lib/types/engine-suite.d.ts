import type { EngineDefinition } from './engine/types.js';
import type { SessionStore, SessionStoreFlush } from '@anthropic-ai/claude-agent-sdk';
import { EngineAssetRegistry, type EngineMcpSet, type EngineSkillSet } from './assets.js';
import type { ModelRecord } from './model/types.js';
import { type CodexLaunch } from './codex/launch.js';
import { type ClaudeAgentSession, type ClaudeAdapterOptions } from './claude/adapter.js';
import { materializeClaudeMcpOptions, type CanonicalMcpSet, type ClaudeMcpMaterializeOptions } from './claude/mcp.js';
import { materializeClaudeSkills, type CanonicalSkillAssets } from './claude/skills.js';
import { type ClaudeArchiveState, type ClaudeArchiveStore, type ClaudeImportedSession, type ClaudeSdkGateway, type ClaudeSessionDescriptor, type ClaudeSessionHistoryOptions, type ListClaudeSessionsInput } from './claude/persistence.js';
import type { ClaudePersistenceHandle } from './claude/types.js';
import { EngineRegistry, ModelCatalog, ProviderRegistry } from './registry.js';
import type { EngineProfileSnapshot, EngineSelection } from './profile/types.js';
import { EngineProfileCatalog } from './profile/catalog.js';
import type { JsonRpcRequestHandler } from './codex/json-rpc.js';
export interface ExternalEngineLaunch {
    readonly runtime: import('./agent/runtime.js').ExternalEngineRuntime;
    readonly profile: EngineProfileSnapshot;
    readonly runtimeRoot: string;
    readonly nativeSessionId: string;
    close(): Promise<void>;
}
export interface OpenEngineOptions {
    readonly apiKey: string;
    readonly cwd: string;
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly disposeGraceMs?: number;
    readonly runtimeRoot?: string;
    readonly preserveRuntimeRoot?: boolean;
    readonly resumeThreadId?: string;
    readonly permissionPreset?: string;
    readonly serverRequestHandler?: JsonRpcRequestHandler;
    /** Optional runtime asset overrides; profile references are used by default. */
    readonly mcpSet?: EngineMcpSet;
    readonly skillSet?: EngineSkillSet;
    /** Harness-owned MCP is injected separately and never enters the user materializer. */
    readonly internalMcpSet?: EngineMcpSet;
    /** Runtime resolver for profile MCP credential references. */
    readonly credentialResolver?: EngineSuiteCredentialResolver;
    readonly environment?: Readonly<Record<string, string>>;
    /** SDK SessionStore used for Claude transcript mirroring. */
    readonly sessionStore?: SessionStore;
    readonly sessionStoreFlush?: SessionStoreFlush;
}
export interface OpenCodexOptions extends OpenEngineOptions {
}
export interface DiscoverCodexModelsOptions {
    readonly apiKey: string;
    readonly cwd: string;
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly disposeGraceMs?: number;
    readonly runtimeRoot?: string;
    readonly preserveRuntimeRoot?: boolean;
    readonly resumeThreadId?: string;
}
export interface EngineSuite {
    readonly engines: EngineRegistry;
    readonly providers: ProviderRegistry;
    readonly models: ModelCatalog;
    readonly profiles: EngineProfileCatalog;
    readonly assets: EngineAssetRegistry;
    resolveProfile(selection: EngineSelection): EngineProfileSnapshot;
    discoverCodexModels(providerId: string, options: DiscoverCodexModelsOptions): Promise<readonly ModelRecord[]>;
}
/** Internal runtime face. It is intentionally not re-exported from the package root. */
export interface ClaudeSessionConnectionOptions extends Omit<OpenEngineOptions, 'cwd' | 'resumeThreadId'> {
    readonly handle: ClaudePersistenceHandle;
    readonly cwd?: string;
}
export interface EngineSuiteRuntime extends EngineSuite {
    readonly claudeArchiveStore: ClaudeArchiveStore;
    openCodex(selection: EngineSelection, options: OpenCodexOptions): Promise<CodexLaunch>;
    openEngine(selection: EngineSelection, options: OpenEngineOptions): Promise<ExternalEngineLaunch>;
    listClaudeSessions(input?: ListClaudeSessionsInput): Promise<ClaudeSessionDescriptor[]>;
    getClaudeSessionHistory(handle: ClaudePersistenceHandle, input?: ClaudeSessionHistoryOptions): Promise<import('@anthropic-ai/claude-agent-sdk').SessionMessage[]>;
    importClaudeSession(input: import('./claude/persistence.js').ClaudeImportSessionInput): Promise<ClaudeImportedSession>;
    archiveClaudeSession(handle: ClaudePersistenceHandle, archivedAt?: string): ClaudeArchiveState;
    unarchiveClaudeSession(handle: ClaudePersistenceHandle): boolean;
    resumeClaudeSession(selection: EngineSelection, options: ClaudeSessionConnectionOptions): Promise<ExternalEngineLaunch>;
    reconnectClaudeSession(selection: EngineSelection, options: ClaudeSessionConnectionOptions): Promise<ExternalEngineLaunch>;
}
export declare const CODEX_ENGINE: EngineDefinition;
export declare const CLAUDE_ENGINE: EngineDefinition;
export type EngineSuiteCredentialResolver = (credentialRef: string) => string | undefined | Promise<string | undefined>;
export type ClaudeMcpMaterializer = (input: CanonicalMcpSet, options: ClaudeMcpMaterializeOptions) => ReturnType<typeof materializeClaudeMcpOptions>;
export type ClaudeSkillMaterializer = (input: CanonicalSkillAssets) => ReturnType<typeof materializeClaudeSkills>;
export interface CreateEngineSuiteRuntimeOptions {
    readonly claudeSessionFactory?: (options: ClaudeAdapterOptions) => ClaudeAgentSession;
    readonly credentialResolver?: EngineSuiteCredentialResolver;
    readonly claudeMcpMaterializer?: ClaudeMcpMaterializer;
    readonly claudeSkillMaterializer?: ClaudeSkillMaterializer;
    readonly claudeSdkGateway?: ClaudeSdkGateway;
    readonly claudeArchiveStore?: ClaudeArchiveStore;
}
export declare function createEngineSuiteRuntime(options?: CreateEngineSuiteRuntimeOptions): EngineSuiteRuntime;
export declare function createEngineSuite(): EngineSuite;
//# sourceMappingURL=engine-suite.d.ts.map