import type { EngineDefinition } from './engine/types.js';
import type { ModelRecord } from './model/types.js';
import { type CodexLaunch } from './codex/launch.js';
import { EngineRegistry, ModelCatalog, ProviderRegistry } from './registry.js';
import type { EngineProfileSnapshot, EngineSelection } from './profile/types.js';
export interface OpenCodexOptions {
    readonly apiKey: string;
    readonly cwd: string;
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly disposeGraceMs?: number;
}
export interface DiscoverCodexModelsOptions {
    readonly apiKey: string;
    readonly cwd: string;
    readonly executable?: string;
    readonly args?: readonly string[];
    readonly disposeGraceMs?: number;
}
export interface EngineSuite {
    readonly engines: EngineRegistry;
    readonly providers: ProviderRegistry;
    readonly models: ModelCatalog;
    resolveProfile(selection: EngineSelection): EngineProfileSnapshot;
    discoverCodexModels(providerId: string, options: DiscoverCodexModelsOptions): Promise<readonly ModelRecord[]>;
}
/** Internal runtime face. It is intentionally not re-exported from the package root. */
export interface EngineSuiteRuntime extends EngineSuite {
    openCodex(selection: EngineSelection, options: OpenCodexOptions): Promise<CodexLaunch>;
}
export declare const CODEX_ENGINE: EngineDefinition;
export declare function createEngineSuiteRuntime(): EngineSuiteRuntime;
export declare function createEngineSuite(): EngineSuite;
//# sourceMappingURL=engine-suite.d.ts.map