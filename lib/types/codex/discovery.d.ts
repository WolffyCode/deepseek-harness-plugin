import type { EngineProvider } from '../provider/types.js';
import { type ModelRecord } from '../model/types.js';
export interface CodexModelDiscoveryOptions {
    readonly provider: EngineProvider;
    readonly apiKey: string;
    readonly cwd: string;
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly disposeGraceMs?: number;
    readonly startupTimeoutMs?: number;
}
export declare function discoverCodexModels(options: CodexModelDiscoveryOptions): Promise<readonly ModelRecord[]>;
//# sourceMappingURL=discovery.d.ts.map