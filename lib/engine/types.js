export function assertEngineId(id) {
    const normalized = id.trim();
    if (normalized.length === 0)
        throw new Error('engine id must not be empty');
    return normalized;
}
//# sourceMappingURL=types.js.map