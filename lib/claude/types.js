export const claudeUserAgentDefinitionsBrand = Symbol('claude-user-agent-definitions');
export function createClaudeUserAgentDefinitions(definitions) {
    return Object.freeze({
        source: 'user',
        definitions: Object.freeze({ ...definitions }),
        [claudeUserAgentDefinitionsBrand]: true,
    });
}
export function isClaudeUserAgentDefinitions(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    const definitions = candidate['definitions'];
    return candidate['source'] === 'user'
        && candidate[claudeUserAgentDefinitionsBrand] === true
        && typeof definitions === 'object'
        && definitions !== null
        && !Array.isArray(definitions);
}
//# sourceMappingURL=types.js.map