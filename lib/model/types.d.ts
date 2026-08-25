import type { EngineId } from '../engine/types.js';
import type { ProviderId } from '../provider/types.js';
export type ModelRecordId = string;
export type ModelSource = 'discovered' | 'manual';
export type ContextWindowSource = 'discovered' | 'manual' | 'unknown';
export interface ReasoningOption {
    readonly id: string;
    readonly description?: string;
}
export interface ModelRecord {
    readonly id: ModelRecordId;
    readonly engineId: EngineId;
    readonly providerId: ProviderId;
    readonly modelId: string;
    readonly displayName?: string;
    readonly description?: string;
    readonly enabled: boolean;
    readonly hidden: boolean;
    readonly reasoningOptions: readonly ReasoningOption[];
    readonly defaultReasoningEffort?: string;
    readonly inputModalities: readonly string[];
    readonly contextWindowTokens?: number;
    readonly contextWindowSource: ContextWindowSource;
    readonly source: ModelSource;
    readonly discoveredAt?: number;
}
export interface CreateModelInput {
    readonly id: ModelRecordId;
    readonly engineId: EngineId;
    readonly providerId: ProviderId;
    readonly modelId: string;
    readonly displayName?: string;
    readonly description?: string;
    readonly reasoningOptions?: readonly ReasoningOption[];
    readonly defaultReasoningEffort?: string;
    readonly inputModalities?: readonly string[];
    readonly contextWindowTokens?: number;
    readonly contextWindowSource?: ContextWindowSource;
    readonly source: ModelSource;
}
export declare function createModel(input: CreateModelInput): ModelRecord;
//# sourceMappingURL=types.d.ts.map