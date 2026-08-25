import type { EngineId } from '../engine/types.js';
import type { ModelRecordId } from '../model/types.js';
import type { ProviderId } from '../provider/types.js';
export type EngineProfileId = string;
export interface EngineSelection {
    readonly engineId: EngineId;
    readonly providerId: ProviderId;
    readonly modelRecordId: ModelRecordId;
    readonly reasoningEffort?: string;
}
export interface EngineProfile {
    readonly id: EngineProfileId;
    readonly name: string;
    readonly revision: number;
    readonly engineId: EngineId;
    readonly providerId: ProviderId;
    readonly modelRecordId: ModelRecordId;
    readonly modelId: string;
    readonly reasoningEffort?: string;
    readonly contextWindowTokens?: number;
    readonly skillSetRef?: string;
    readonly mcpSetRef?: string;
    readonly allowedChildProfiles: readonly EngineProfileId[];
    readonly maxChildDepth: number;
    readonly maxConcurrentChildren: number;
}
export interface EngineProfileSnapshot extends EngineProfile {
    readonly snapshot: true;
}
//# sourceMappingURL=types.d.ts.map