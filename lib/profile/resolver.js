export function resolveEngineProfile(dependencies, selection, options = {}) {
    const engine = dependencies.engines.get(selection.engineId);
    const provider = dependencies.providers.get(selection.providerId);
    const model = dependencies.models.get(selection.modelRecordId);
    if (provider.engineId !== engine.id) {
        throw new Error(`provider ${provider.id} does not belong to engine ${engine.id}`);
    }
    if (model.engineId !== engine.id || model.providerId !== provider.id) {
        throw new Error(`model ${model.id} does not belong to provider ${provider.id}`);
    }
    if (!provider.enabled)
        throw new Error(`provider is disabled: ${provider.id}`);
    if (!model.enabled)
        throw new Error(`model is disabled: ${model.id}`);
    if (selection.reasoningEffort !== undefined
        && !model.reasoningOptions.some(option => option.id === selection.reasoningEffort)) {
        throw new Error(`reasoning effort is not supported by model ${model.modelId}: ${selection.reasoningEffort}`);
    }
    const revision = options.revision ?? 1;
    if (!Number.isSafeInteger(revision) || revision <= 0)
        throw new Error('profile revision must be a positive safe integer');
    const maxChildDepth = options.maxChildDepth ?? 1;
    const maxConcurrentChildren = options.maxConcurrentChildren ?? 1;
    if (!Number.isSafeInteger(maxChildDepth) || maxChildDepth < 0)
        throw new Error('max child depth must be a non-negative safe integer');
    if (!Number.isSafeInteger(maxConcurrentChildren) || maxConcurrentChildren < 1) {
        throw new Error('max concurrent children must be a positive safe integer');
    }
    const id = options.id ?? `${engine.id}/${provider.id}/${model.id}/${selection.reasoningEffort ?? 'default'}`;
    const profile = {
        id,
        name: options.name ?? id,
        revision,
        engineId: engine.id,
        providerId: provider.id,
        modelRecordId: model.id,
        modelId: model.modelId,
        ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
        ...model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens },
        allowedChildProfiles: [...options.allowedChildProfiles ?? []],
        maxChildDepth,
        maxConcurrentChildren,
    };
    return Object.freeze({ ...profile, snapshot: true });
}
export function engineIdFromProfile(profile) {
    return profile.engineId;
}
//# sourceMappingURL=resolver.js.map