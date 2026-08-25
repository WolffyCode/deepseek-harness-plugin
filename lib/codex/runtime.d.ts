import type { JsonObject, JsonRpcLineTransport, JsonValue } from './json-rpc.js';
import { CodexProcess, type CodexProcessOptions, type ProcessExit } from './process.js';
export interface CodexRuntimeOptions extends CodexProcessOptions {
    readonly modelProvider?: string;
    readonly model?: string;
    readonly reasoningEffort?: string;
    readonly baseInstructions?: string;
    readonly ephemeral?: boolean;
    readonly approvalPolicy?: JsonValue;
    readonly sandbox?: JsonValue;
}
export interface CodexThread {
    readonly id: string;
    readonly ephemeral?: boolean;
}
export interface CodexTurn {
    readonly id: string;
}
/** Codex app-server lifecycle for one Harness Agent. */
export declare class CodexRuntime {
    private readonly options;
    readonly process: CodexProcess;
    readonly transport: JsonRpcLineTransport;
    private thread;
    private turn;
    private closed;
    private constructor();
    static open(options: CodexRuntimeOptions): Promise<CodexRuntime>;
    get threadId(): string | undefined;
    get turnId(): string | undefined;
    initialize(signal?: AbortSignal): Promise<void>;
    listModels(options?: {
        readonly includeHidden?: boolean;
        readonly limit?: number;
    }, signal?: AbortSignal): Promise<readonly JsonObject[]>;
    startThread(signal?: AbortSignal): Promise<CodexThread>;
    resumeThread(threadId: string, signal?: AbortSignal): Promise<CodexThread>;
    startTurn(text: string, signal?: AbortSignal): Promise<CodexTurn>;
    steer(text: string, signal?: AbortSignal): Promise<JsonValue>;
    interrupt(signal?: AbortSignal): Promise<JsonValue>;
    close(): Promise<ProcessExit>;
}
//# sourceMappingURL=runtime.d.ts.map