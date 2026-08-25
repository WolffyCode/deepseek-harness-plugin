import { type ChildProcessWithoutNullStreams } from 'node:child_process';
export interface CodexProcessOptions {
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly disposeGraceMs?: number;
    readonly redactions?: readonly string[];
}
export interface ProcessExit {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stderr: string;
    readonly error?: Error;
}
/** Owns one Codex app-server process and its complete teardown. */
export declare class CodexProcess {
    private readonly options;
    readonly child: ChildProcessWithoutNullStreams;
    private stderr;
    private disposed;
    private readonly exitPromise;
    private constructor();
    static start(options: CodexProcessOptions): CodexProcess;
    get stderrTail(): string;
    get exited(): Promise<ProcessExit>;
    dispose(): Promise<ProcessExit>;
}
export declare function waitForProcessExit(process: CodexProcess): Promise<ProcessExit>;
export declare function waitForChildClose(child: ChildProcessWithoutNullStreams): Promise<void>;
export declare function processEnvironmentSecretKeys(): readonly string[];
//# sourceMappingURL=process.d.ts.map