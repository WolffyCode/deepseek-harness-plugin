import type { EngineDefinition, EngineId } from './engine/types.js';
import type { CreateModelInput, ModelRecord, ModelRecordId } from './model/types.js';
import type { CreateProviderInput, EngineProvider, ProviderId } from './provider/types.js';
export declare class EngineRegistry {
    private readonly definitions;
    register(definition: EngineDefinition): void;
    get(id: EngineId): EngineDefinition;
    list(): readonly EngineDefinition[];
}
export declare class ProviderRegistry {
    private readonly providers;
    register(input: CreateProviderInput): EngineProvider;
    replaceAll(inputs: readonly CreateProviderInput[]): void;
    get(id: ProviderId): EngineProvider;
    list(engineId?: EngineId): readonly EngineProvider[];
}
export declare class ModelCatalog {
    private readonly models;
    register(input: CreateModelInput): ModelRecord;
    replaceAll(inputs: readonly CreateModelInput[]): void;
    get(id: ModelRecordId): ModelRecord;
    list(providerId?: ProviderId): readonly ModelRecord[];
    replaceProvider(providerId: ProviderId, models: readonly ModelRecord[]): void;
}
//# sourceMappingURL=registry.d.ts.map