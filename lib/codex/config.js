import { normalizeBaseUri } from '../provider/types.js';
function tomlString(value) {
    return JSON.stringify(value);
}
function nonEmpty(value, label) {
    const normalized = value.trim();
    if (normalized.length === 0)
        throw new Error(`${label} must not be empty`);
    return normalized;
}
function providerKey(value) {
    const normalized = nonEmpty(value, 'provider name').replace(/[^A-Za-z0-9_-]/g, '_');
    return normalized.length > 0 ? normalized : 'dsh_provider';
}
export function renderCodexProviderConfig(input) {
    const providerName = nonEmpty(input.providerName, 'provider name');
    const baseUri = normalizeBaseUri(input.baseUri);
    const apiKey = nonEmpty(input.apiKey, 'API key');
    const providerKeyName = providerKey(providerName);
    return {
        configToml: [
            `model_provider = ${tomlString(providerKeyName)}`,
            '',
            `[model_providers.${providerKeyName}]`,
            `name = ${tomlString(providerName)}`,
            `base_url = ${tomlString(baseUri)}`,
            'wire_api = "responses"',
            'requires_openai_auth = true',
            '',
        ].join('\n'),
        modelProvider: providerKeyName,
        environment: { OPENAI_API_KEY: apiKey },
        redactions: [apiKey],
    };
}
export function renderCodexConfig(input) {
    const providerName = nonEmpty(input.providerName, 'provider name');
    const baseUri = normalizeBaseUri(input.baseUri);
    const model = nonEmpty(input.model, 'model');
    const apiKey = nonEmpty(input.apiKey, 'API key');
    const providerKeyName = providerKey(providerName);
    const configToml = [
        `model_provider = ${tomlString(providerKeyName)}`,
        `model = ${tomlString(model)}`,
        '',
        `[model_providers.${providerKeyName}]`,
        `name = ${tomlString(providerName)}`,
        `base_url = ${tomlString(baseUri)}`,
        'wire_api = "responses"',
        'requires_openai_auth = true',
        '',
    ].join('\n');
    return {
        configToml,
        modelProvider: providerKeyName,
        environment: { OPENAI_API_KEY: apiKey },
        redactions: [apiKey],
    };
}
//# sourceMappingURL=config.js.map