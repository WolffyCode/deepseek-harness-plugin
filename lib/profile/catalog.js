function nonEmpty(value, label) {
    const normalized = value.trim();
    if (normalized.length === 0)
        throw new Error(`${label} must not be empty`);
    return normalized;
}
function normalizeDefinition(input) {
    const id = nonEmpty(input.id, 'profile id');
    const allowedChildProfiles = [...input.allowedChildProfiles ?? []].map(profileId => nonEmpty(profileId, 'allowed child profile id'));
    if (new Set(allowedChildProfiles).size !== allowedChildProfiles.length)
        throw new Error(`profile ${id} contains duplicate child profiles`);
    if (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision <= 0)) {
        throw new Error(`profile ${id} revision must be a positive safe integer`);
    }
    if (input.maxChildDepth !== undefined && (!Number.isSafeInteger(input.maxChildDepth) || input.maxChildDepth < 0)) {
        throw new Error(`profile ${id} max child depth must be a non-negative safe integer`);
    }
    if (input.maxConcurrentChildren !== undefined && (!Number.isSafeInteger(input.maxConcurrentChildren) || input.maxConcurrentChildren < 1)) {
        throw new Error(`profile ${id} max concurrent children must be a positive safe integer`);
    }
    return {
        ...input,
        id,
        ...input.name === undefined ? {} : { name: nonEmpty(input.name, 'profile name') },
        ...input.revision === undefined ? {} : { revision: input.revision },
        selection: { ...input.selection },
        allowedChildProfiles,
        ...input.skillSetRef === undefined ? {} : { skillSetRef: nonEmpty(input.skillSetRef, 'skill set reference') },
        ...input.mcpSetRef === undefined ? {} : { mcpSetRef: nonEmpty(input.mcpSetRef, 'MCP set reference') },
        enabled: input.enabled ?? true,
    };
}
/** Durable profile policy catalog. Selection remains the Composer-facing identity. */
export class EngineProfileCatalog {
    definitions = new Map();
    register(input) {
        const definition = normalizeDefinition(input);
        if (this.definitions.has(definition.id))
            throw new Error(`profile already registered: ${definition.id}`);
        this.definitions.set(definition.id, definition);
        return definition;
    }
    replaceAll(inputs) {
        const next = inputs.map(normalizeDefinition);
        const ids = new Set();
        for (const definition of next) {
            if (ids.has(definition.id))
                throw new Error(`profile already registered: ${definition.id}`);
            ids.add(definition.id);
        }
        this.definitions.clear();
        for (const definition of next)
            this.definitions.set(definition.id, definition);
    }
    get(id) {
        const definition = this.definitions.get(id);
        if (definition === undefined)
            throw new Error(`unknown profile: ${id}`);
        return definition;
    }
    list() {
        return [...this.definitions.values()];
    }
    find(selection) {
        return this.list().find(definition => definition.enabled !== false
            && definition.selection.engineId === selection.engineId
            && definition.selection.providerId === selection.providerId
            && definition.selection.modelRecordId === selection.modelRecordId
            && definition.selection.reasoningEffort === selection.reasoningEffort);
    }
}
//# sourceMappingURL=catalog.js.map