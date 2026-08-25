import type { ModelRecord } from '../model/types.js';
import type { EngineProvider } from '../provider/types.js';
import type { EngineProfileSnapshot } from '../profile/types.js';
import { CodexRuntime } from './runtime.js';
export interface CodexLaunchOptions {
    readonly profile: EngineProfileSnapshot;
    readonly provider: EngineProvider;
    readonly model: ModelRecord;
    readonly apiKey: string;
    readonly cwd: string;
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly disposeGraceMs?: number;
    readonly baseInstructions?: string;
    readonly ephemeral?: boolean;
    readonly runtimeRoot?: string;
}
export interface CodexLaunch {
    readonly runtime: CodexRuntime;
    readonly profile: EngineProfileSnapshot;
    readonly runtimeRoot: string;
    readonly codexHome: string;
    close(): Promise<void>;
}
/**
 * Materializes one profile into an isolated CODEX_HOME and starts one Codex
 * app-server. The API key is passed through the child environment only; it is
 * never written to config.toml.
 */
export declare function openCodexLaunch(options: CodexLaunchOptions): Promise<CodexLaunch>;
//# sourceMappingURL=launch.d.ts.map