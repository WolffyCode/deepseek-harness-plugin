import type { Context } from '@deepseek-ai/cordis';
import { Inbox, type Agent, type AgentCancelCause, type AgentOptions, type AgentStatus, type CancelOptions, type InboxTarget } from '@deepseek-ai/dsh-agent';
import { type UserMessage } from '@deepseek-ai/dsh-llm';
import type { Session, SessionId } from '@deepseek-ai/dsh-session';
import type { CodexRuntime } from '../codex/runtime.js';
/**
 * Minimal external Agent implementation for one Codex runtime.
 *
 * Codex owns planning and tool execution. Harness owns Agent identity, inbox,
 * lifecycle events, Session persistence, and the visible assistant transcript.
 */
export declare class ExternalCodexAgent implements Agent {
    private readonly loopCtx;
    readonly id: SessionId;
    readonly options: AgentOptions;
    readonly session: Session;
    private readonly runtime;
    private readonly provider;
    private readonly model;
    readonly inbox: Inbox;
    readonly ctx: Context;
    private readonly scope;
    private readonly dispatch;
    private phase;
    private activityDone;
    private disposed;
    private nextTurn;
    constructor(loopCtx: Context, id: SessionId, options: AgentOptions, session: Session, runtime: CodexRuntime, provider: string, model: string);
    get status(): AgentStatus;
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
//# sourceMappingURL=external-codex-agent.d.ts.map