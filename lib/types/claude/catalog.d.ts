export interface CatalogCommand {
    readonly name: string;
    readonly id: string;
    readonly displayName: string;
    readonly description: string;
    readonly argumentHint: string;
    readonly aliases: readonly string[];
}
export interface CatalogModel {
    readonly id: string;
    readonly value: string;
    readonly resolvedModel?: string;
    readonly displayName: string;
    readonly description: string;
    readonly supportsEffort?: boolean;
    readonly supportedEffortLevels?: readonly ('low' | 'medium' | 'high' | 'xhigh' | 'max')[];
    readonly supportsAdaptiveThinking?: boolean;
    readonly supportsFastMode?: boolean;
    readonly supportsAutoMode?: boolean;
}
export interface CatalogQuery {
    supportedCommands(): Promise<readonly unknown[]>;
    supportedModels(): Promise<readonly unknown[]>;
}
export declare class CatalogError extends Error {
    readonly code: 'query_failed' | 'invalid_result' | 'aborted' | 'timeout' | 'closed';
    constructor(code: CatalogError['code'], message: string, options?: {
        readonly cause?: unknown;
    });
}
export declare function mapSdkSlashCommand(command: unknown): CatalogCommand;
export declare function mapSdkModel(model: unknown): CatalogModel;
export interface DiscoveredMode {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
}
export type DiscoveredThinking = Readonly<Record<string, unknown>>;
export type DiscoveryResult<T> = {
    readonly status: 'ok';
    readonly value: readonly T[];
} | {
    readonly status: 'not_provided';
} | {
    readonly status: 'failure';
    readonly error: CatalogError;
};
export type Discovery<T> = (signal?: AbortSignal) => Promise<readonly T[]>;
export interface DiscoveryOptions {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
}
export declare function discoverModes(discovery: Discovery<DiscoveredMode> | undefined, options?: DiscoveryOptions): Promise<DiscoveryResult<DiscoveredMode>>;
export declare function discoverThinking(discovery: Discovery<DiscoveredThinking> | undefined, options?: DiscoveryOptions): Promise<DiscoveryResult<DiscoveredThinking>>;
export type CatalogLoadResult<T> = {
    readonly status: 'ok';
    readonly value: readonly T[];
    readonly version: number;
    readonly stale: false;
} | {
    readonly status: 'failure';
    readonly error: CatalogError;
    readonly version: number;
    readonly stale: boolean;
    readonly value?: readonly T[];
};
export interface CatalogLoadOptions {
    readonly force?: boolean;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
}
export interface CatalogAllResult {
    readonly commands: CatalogLoadResult<CatalogCommand>;
    readonly models: CatalogLoadResult<CatalogModel>;
}
export interface CatalogCacheOptions {
    readonly ttlMs?: number;
    readonly clock?: () => number;
}
export declare class ClaudeCatalogCache {
    private readonly query;
    private readonly ttlMs;
    private readonly clock;
    private commandsEntry;
    private modelsEntry;
    private commandsGeneration;
    private modelsGeneration;
    private commandsVersion;
    private modelsVersion;
    private commandsOperation;
    private modelsOperation;
    private closed;
    constructor(query: CatalogQuery, options?: CatalogCacheOptions);
    loadCommands(options?: CatalogLoadOptions): Promise<CatalogLoadResult<CatalogCommand>>;
    loadModels(options?: CatalogLoadOptions): Promise<CatalogLoadResult<CatalogModel>>;
    loadAll(options?: CatalogLoadOptions): Promise<CatalogAllResult>;
    invalidate(kind?: 'commands' | 'models'): void;
    close(): void;
    private startCommands;
    private startModels;
    private fetchCommands;
    private fetchModels;
    private commandFailure;
    private modelFailure;
    private waitCommands;
    private waitModels;
}
//# sourceMappingURL=catalog.d.ts.map