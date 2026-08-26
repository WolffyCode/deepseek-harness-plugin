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
function renderMcpServers(mcpSet) {
    if (mcpSet === undefined)
        return [];
    const lines = [];
    for (const server of mcpSet.servers) {
        const key = server.id.replace(/[^A-Za-z0-9_-]/g, '_') || 'mcp_server';
        lines.push(`[mcp_servers.${key}]`);
        if (server.transport === 'stdio') {
            if (server.command === undefined)
                throw new Error(`stdio MCP server ${server.id} requires a command`);
            lines.push(`command = ${tomlString(server.command)}`);
            if (server.args !== undefined)
                lines.push(`args = ${JSON.stringify([...server.args])}`);
        }
        else {
            lines.push(`url = ${tomlString(server.url ?? '')}`);
        }
        if (server.transport === 'stdio' && server.environment !== undefined) {
            lines.push(`env = ${JSON.stringify(server.environment)}`);
        }
        lines.push('');
    }
    return lines;
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
            'env_key = "OPENAI_API_KEY"',
            'requires_openai_auth = true',
            '',
            '[shell_environment_policy]',
            'inherit = "none"',
            '',
            ...renderMcpServers(input.mcpSet),
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
        'env_key = "OPENAI_API_KEY"',
        'requires_openai_auth = true',
        '',
        '[shell_environment_policy]',
        'inherit = "none"',
        '',
        ...renderMcpServers(input.mcpSet),
    ].join('\n');
    return {
        configToml,
        modelProvider: providerKeyName,
        environment: { OPENAI_API_KEY: apiKey },
        redactions: [apiKey],
    };
}
//# sourceMappingURL=config.js.map