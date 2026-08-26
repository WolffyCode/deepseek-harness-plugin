import type { Context } from '@deepseek-ai/cordis';
import { Inbox, type Agent, type AgentCancelCause, type AgentOptions, type AgentStatus, type CancelOptions, type InboxTarget } from '@deepseek-ai/dsh-agent';
import { type UserMessage } from '@deepseek-ai/dsh-llm';
import type { Session, SessionId } from '@deepseek-ai/dsh-session';
import { type ExternalEngineRuntime } from './runtime.js';
/**
 * Agent bridge for one local external engine runtime.
 *
 * The selected CLI owns planning and tool execution. Harness owns Agent identity,
 * inbox, lifecycle events, Session persistence, and the visible transcript.
 */
export declare class ExternalEngineAgent implements Agent {
    private readonly loopCtx;
    readonly id: SessionId;
    readonly options: AgentOptions;
    readonly session: Session;
    private runtime;
    private provider;
    private model;
    readonly inbox: Inbox;
    readonly ctx: Context;
    private readonly scope;
    private readonly dispatch;
    private phase;
    private activityDone;
    private disposed;
    private nextTurn;
    constructor(loopCtx: Context, id: SessionId, options: AgentOptions, session: Session, runtime: ExternalEngineRuntime, provider: string, model: string);
    get status(): AgentStatus;
    /** Replace the idle CLI runtime while preserving the Harness Agent/Session identity. */
    replaceRuntime(runtime: ExternalEngineRuntime, provider: string, model: string): void;
    send(message: UserMessage, target: InboxTarget, wakeup: boolean): void;
    followup(message: UserMessage): void;
    steer(message: UserMessage): void;
    inject(message: UserMessage): void;
    cancel(cause: AgentCancelCause, options?: CancelOptions): void;
    whenIdle(): Promise<void>;
    runMaintenance<T>(job: (signal: AbortSignal) => Promise<T>): Promise<T>;
    dispose(): Promise<void>;
    private wake;
    private drive;
    private waitTurn;
}
//# sourceMappingURL=external-engine-agent.d.ts.map