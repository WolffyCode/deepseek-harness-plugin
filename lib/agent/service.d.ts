import type { Context } from '@deepseek-ai/cordis';
import { type Agent, type AgentFactory, type AgentHandle, type CreateAgentOptions, type ResumeAgentOptions } from '@deepseek-ai/dsh-agent';
import { type Session } from '@deepseek-ai/dsh-session';
import type { EngineSuiteRuntime } from '../engine-suite.js';
import type { EngineSelection } from '../profile/types.js';
import type { EngineProfileId } from '../profile/types.js';
import { ExternalEngineBindingStore } from '../engine/bindings.js';
import type { EngineSuiteCommandView } from '../types.js';
import { type ParentChildLineageDescriptor, type ParentChildLineageEvent, type ParentChildLineageStore } from '../orchestration/lineage.js';
export interface HostAgentHandleStore {
    wait(sessionId: string, agent: Agent): Promise<AgentHandle | undefined>;
    take(sessionId: string, agent: Agent): AgentHandle | undefined;
}
export interface CreateExternalAgentOptions {
    readonly sessionId: string;
    readonly selection: EngineSelection;
    readonly apiKey: string;
    readonly cwd: string;
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly startupTimeoutMs?: number;
}
export interface DelegateExternalAgentOptions {
    readonly profileId: EngineProfileId;
    readonly task: string;
    /** Programmatic host-only override; the MCP bridge never carries this field. */
    readonly apiKey?: string;
    /** Test/deployment executable override; the MCP bridge never carries this field. */
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly startupTimeoutMs?: number;
    readonly nativeTaskId?: string;
}
export interface EngineSuiteAgentHandle extends AgentHandle {
    readonly session: Session;
    readonly parentSessionId?: string;
    readonly delegationDepth: number;
    readonly nativeTaskId?: string;
    profileId: string;
    selection: EngineSelection;
    updateSelection(selection: EngineSelection, apiKey: string, permissionPreset?: string): Promise<void>;
    listCommands(refresh?: boolean): Promise<readonly EngineSuiteCommandView[]>;
}
/**
 * Creates and registers external Engine Agents without replacing Harness core
 * services. Harness owns native Session creation; this service is entered only
 * by an explicit external-engine selection or child delegation.
 */
export declare class EngineSuiteAgentService implements AgentFactory {
    private readonly ctx;
    private readonly suite;
    private readonly resolveApiKey;
    private readonly hostAgentHandles?;
    private readonly live;
    private readonly children;
    private readonly bindings;
    private readonly childBridge;
    private readonly childBridgeReady;
    private readonly lineageStore;
    private readonly closedSessions;
    private readonly childReservations;
    private readonly sessionOperations;
    constructor(ctx: Context, suite: EngineSuiteRuntime, resolveApiKey: (credentialRef: string) => string | Promise<string>, bindings?: ExternalEngineBindingStore, lineageStore?: ParentChildLineageStore, hostAgentHandles?: HostAgentHandleStore | undefined);
    createExternal(options: CreateExternalAgentOptions): Promise<EngineSuiteAgentHandle>;
    createCodex(options: CreateExternalAgentOptions): Promise<EngineSuiteAgentHandle>;
    switchExternal(sessionId: string, selection: EngineSelection, apiKey: string): Promise<EngineSuiteAgentHandle>;
    listCommands(sessionId: string, refresh?: boolean): Promise<readonly EngineSuiteCommandView[]>;
    /** Create a child Engine Agent from an authorized parent profile. */
    delegate(parentSessionId: string, request: DelegateExternalAgentOptions): Promise<{
        readonly handle: EngineSuiteAgentHandle;
        readonly text: string;
        readonly lineage: ParentChildLineageDescriptor;
    }>;
    /** Optional AgentFactory entry for embedders that explicitly choose Engine Suite ownership. */
    createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>;
    /** Cold resume invoked by Harness API Remote lookup after a process restart. */
    resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<EngineSuiteAgentHandle>;
    list(): readonly EngineSuiteAgentHandle[];
    listLineages(parentSessionId?: string): ParentChildLineageDescriptor[];
    subscribeLineage(parentSessionId: string, listener: (event: ParentChildLineageEvent) => void): () => void;
    replayLineage(parentSessionId: string, afterSequence?: number): ParentChildLineageEvent[];
    resumeChild(childSessionId: string): Promise<EngineSuiteAgentHandle>;
    archiveChild(childSessionId: string): Promise<ParentChildLineageDescriptor>;
    detachChild(childSessionId: string): Promise<ParentChildLineageDescriptor>;
    cancelChild(childSessionId: string): Promise<ParentChildLineageDescriptor>;
    private cancelChildren;
    private shouldDisposeWithParent;
    private delegateNative;
    private delegateFromBridge;
    private defaultSelection;
    private findLiveSession;
    private withSessionOperation;
    private createExternalOn;
    private observeChildRuntimeEvent;
    private attachWorkspace;
}
//# sourceMappingURL=service.d.ts.map