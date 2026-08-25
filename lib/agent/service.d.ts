import type { Context } from '@deepseek-ai/cordis';
import { type AgentHandle } from '@deepseek-ai/dsh-agent';
import { type Session } from '@deepseek-ai/dsh-session';
import type { EngineSuiteRuntime } from '../engine-suite.js';
import type { EngineSelection } from '../profile/types.js';
export interface CreateCodexAgentOptions {
    readonly sessionId: string;
    readonly selection: EngineSelection;
    readonly apiKey: string;
    readonly cwd: string;
    readonly executable?: string;
    readonly args?: readonly string[];
}
export interface EngineSuiteAgentHandle extends AgentHandle {
    readonly session: Session;
    readonly profileId: string;
}
/** Creates and registers external Codex Agents without replacing Harness core services. */
export declare class EngineSuiteAgentService {
    private readonly ctx;
    private readonly suite;
    private readonly live;
    constructor(ctx: Context, suite: EngineSuiteRuntime);
    createCodex(options: CreateCodexAgentOptions): Promise<EngineSuiteAgentHandle>;
    list(): readonly EngineSuiteAgentHandle[];
}
//# sourceMappingURL=service.d.ts.map