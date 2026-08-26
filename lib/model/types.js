export function createModel(input) {
    const modelId = input.modelId.trim();
    if (modelId.length === 0)
        throw new Error('model id must not be empty');
    if (input.contextWindowTokens !== undefined
        && (!Number.isSafeInteger(input.contextWindowTokens) || input.contextWindowTokens <= 0)) {
        throw new Error('context window must be a positive safe integer');
    }
    const reasoningOptions = [...input.reasoningOptions ?? []];
    const reasoningIds = new Set();
    for (const option of reasoningOptions) {
        const id = option.id.trim();
        if (id.length === 0)
            throw new Error('reasoning option id must not be empty');
        if (reasoningIds.has(id))
            throw new Error(`duplicate reasoning option: ${id}`);
        reasoningIds.add(id);
    }
    if (input.defaultReasoningEffort !== undefined && !reasoningIds.has(input.defaultReasoningEffort)) {
        throw new Error('default reasoning effort must be advertised by the model');
    }
    return {
        id: input.id,
        engineId: input.engineId,
        providerId: input.providerId,
        modelId,
        ...input.displayName === undefined ? {} : { displayName: input.displayName.trim() },
        ...input.description === undefined ? {} : { description: input.description },
        enabled: input.enabled ?? true,
        hidden: input.hidden ?? false,
        reasoningOptions,
        ...input.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: input.defaultReasoningEffort },
        inputModalities: [...input.inputModalities ?? ['text']],
        ...input.contextWindowTokens === undefined ? {} : { contextWindowTokens: input.contextWindowTokens },
        contextWindowSource: input.contextWindowSource ?? 'unknown',
        source: input.source,
    };
}
//# sourceMappingURL=types.js.map