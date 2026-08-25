import type { EngineId } from '../engine/types.js';
import type { ModelCatalog, EngineRegistry, ProviderRegistry } from '../registry.js';
import type { EngineProfile, EngineProfileId, EngineProfileSnapshot, EngineSelection } from './types.js';
export interface ProfileResolverDependencies {
    readonly engines: EngineRegistry;
    readonly providers: ProviderRegistry;
    readonly models: ModelCatalog;
}
export declare function resolveEngineProfile(dependencies: ProfileResolverDependencies, selection: EngineSelection, options?: {
    readonly id?: EngineProfileId;
    readonly name?: string;
    readonly revision?: number;
    readonly allowedChildProfiles?: readonly EngineProfileId[];
    readonly maxChildDepth?: number;
    readonly maxConcurrentChildren?: number;
}): EngineProfileSnapshot;
export declare function engineIdFromProfile(profile: EngineProfile): EngineId;
//# sourceMappingURL=resolver.d.ts.map