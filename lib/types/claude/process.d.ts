import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { SpawnOptions, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;
type ErrorListener = (error: Error) => void;
type ClaudeProcessOptions = SpawnOptions & {
    readonly redactions?: readonly string[];
};
export interface ClaudeProcessExit {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stderr: string;
    readonly error?: Error;
}
/**
 * Owns the Claude CLI child used by the SDK bridge.
 *
 * The SDK passes a complete environment to custom spawners. It is intentionally
 * copied as-is rather than merged with the host environment, so credentials or
 * provider settings from the parent shell cannot leak into the Claude process.
 */
export declare class ClaudeProcess implements SpawnedProcess {
    private readonly child;
    private readonly redactions;
    private readonly abortSignal;
    private readonly abortHandler;
    private stderr;
    private terminatedSignal;
    private closed;
    private readonly exitPromise;
    private readonly closePromise;
    private readonly terminationPromise;
    private constructor();
    static start(options: ClaudeProcessOptions): ClaudeProcess;
    get stdin(): ChildProcessWithoutNullStreams['stdin'];
    get stdout(): ChildProcessWithoutNullStreams['stdout'];
    get killed(): boolean;
    get exitCode(): number | null;
    get signalCode(): NodeJS.Signals | null;
    get pid(): number | undefined;
    get stderrTail(): string;
    get exited(): Promise<ClaudeProcessExit>;
    kill(signal: NodeJS.Signals): boolean;
    on(event: 'exit', listener: ExitListener): this;
    on(event: 'error', listener: ErrorListener): this;
    once(event: 'exit', listener: ExitListener): this;
    once(event: 'error', listener: ErrorListener): this;
    off(event: 'exit', listener: ExitListener): this;
    off(event: 'error', listener: ErrorListener): this;
    close(graceMs?: number): Promise<ClaudeProcessExit>;
    private waitForTermination;
    private redactError;
}
export declare function claudeProcessRedactions(options: {
    readonly authToken?: string;
    readonly environment?: Readonly<Record<string, string | undefined>>;
}): readonly string[];
export {};
//# sourceMappingURL=process.d.ts.map