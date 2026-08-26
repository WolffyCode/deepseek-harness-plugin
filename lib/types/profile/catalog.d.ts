import type { EngineProfileId } from './types.js';
import type { EngineSelection } from './types.js';
export interface EngineProfileDefinition {
    readonly id: EngineProfileId;
    readonly name?: string;
    readonly revision?: number;
    readonly selection: EngineSelection;
    readonly skillSetRef?: string;
    readonly mcpSetRef?: string;
    readonly allowedChildProfiles?: readonly EngineProfileId[];
    readonly maxChildDepth?: number;
    readonly maxConcurrentChildren?: number;
    readonly enabled?: boolean;
}
/** Durable profile policy catalog. Selection remains the Composer-facing identity. */
export declare class EngineProfileCatalog {
    private readonly definitions;
    register(input: EngineProfileDefinition): EngineProfileDefinition;
    replaceAll(inputs: readonly EngineProfileDefinition[]): void;
    get(id: EngineProfileId): EngineProfileDefinition;
    list(): readonly EngineProfileDefinition[];
    find(selection: EngineSelection): EngineProfileDefinition | undefined;
}
//# sourceMappingURL=catalog.d.ts.map