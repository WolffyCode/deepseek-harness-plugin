import { normalizeBaseUri } from '../provider/types.js';
function tomlString(value) { return JSON.stringify(value); }
function nonEmpty(value, label) {
    const normalized = value.trim();
    if (normalized.length === 0)
        throw new Error(`${label} must not be empty`);
    return normalized;
}
function providerKey(value) { return nonEmpty(value, 'provider name').replace(/[^A-Za-z0-9_-]/g, '_') || 'dsh_provider'; }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function rejectForbiddenFields(input, fields) {
    for (const field of fields)
        if (own(input, field))
            throw new Error(`${input.transport} MCP server ${input.id} must not declare ${field}`);
}
function staticEnvironment(input, serverId) {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
        throw new Error(`MCP server ${serverId} environment must be an object`);
    const result = {};
    for (const [rawKey, value] of Object.entries(input)) {
        const key = nonEmpty(rawKey, 'MCP environment key');
        if (/(key|token|secret|password|credential)/iu.test(key))
            throw new Error(`MCP server ${serverId} cannot store a secret-like static environment key: ${key}`);
        if (typeof value !== 'string')
            throw new Error(`MCP server ${serverId} environment values must be strings`);
        result[key] = value;
    }
    return result;
}
function staticHeaders(input, serverId) {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
        throw new Error(`MCP server ${serverId} headers must be an object`);
    const result = {};
    for (const [rawKey, value] of Object.entries(input)) {
        const key = nonEmpty(rawKey, 'MCP header key');
        if (/(authorization|api[-_]?key|token|secret|password|credential)/iu.test(key))
            throw new Error(`MCP server ${serverId} cannot store a secret-like static header: ${key}`);
        if (typeof value !== 'string')
            throw new Error(`MCP server ${serverId} header values must be strings`);
        result[key] = value;
    }
    return result;
}
function credentialRefs(server, staticTargets) {
    if (server.credentialRefs === undefined)
        return new Map();
    if (typeof server.credentialRefs !== 'object' || server.credentialRefs === null || Array.isArray(server.credentialRefs))
        throw new Error(`MCP server ${server.id} credentialRefs must be an object`);
    const result = new Map();
    for (const [rawTarget, rawReference] of Object.entries(server.credentialRefs)) {
        const target = nonEmpty(rawTarget, 'MCP credential target');
        if (staticTargets.has(target))
            throw new Error(`MCP server ${server.id} cannot define both static and credential-backed MCP target: ${target}`);
        if (typeof rawReference !== 'string')
            throw new Error(`MCP server ${server.id} credential references must be strings`);
        result.set(target, nonEmpty(rawReference, 'MCP credential reference'));
    }
    return result;
}
function normalizedMcpServers(mcpSet) {
    if (mcpSet === undefined)
        return [];
    const setId = nonEmpty(mcpSet.id, 'MCP set id');
    if (!Array.isArray(mcpSet.servers))
        throw new Error(`MCP set ${setId} servers must be an array`);
    const ids = new Set(), keys = new Set();
    return mcpSet.servers.map(input => {
        if (typeof input !== 'object' || input === null || Array.isArray(input))
            throw new Error(`MCP set ${setId} contains an invalid server`);
        const id = nonEmpty(input.id, 'MCP server id');
        nonEmpty(input.name, 'MCP server name');
        if (ids.has(id))
            throw new Error(`MCP set ${setId} contains duplicate server: ${id}`);
        ids.add(id);
        const key = id.replace(/[^A-Za-z0-9_-]/g, '_') || 'mcp_server';
        if (keys.has(key))
            throw new Error(`MCP set ${setId} contains server ids with the same Codex key: ${key}`);
        keys.add(key);
        if (input.transport === 'stdio') {
            rejectForbiddenFields(input, ['url', 'headers']);
            if (typeof input.command !== 'string')
                throw new Error(`stdio MCP server ${id} requires a command`);
            const command = nonEmpty(input.command, 'MCP command');
            if (input.args !== undefined && !Array.isArray(input.args))
                throw new Error(`MCP server ${id} args must be an array`);
            const args = input.args?.map((arg, index) => {
                if (typeof arg !== 'string')
                    throw new Error(`MCP server ${id} args[${index}] must be a string`);
                return arg;
            });
            const environment = input.environment === undefined ? undefined : staticEnvironment(input.environment, id);
            return { id, key, transport: 'stdio', command, ...(args === undefined ? {} : { args }), ...(environment === undefined ? {} : { environment }), credentialRefs: credentialRefs(input, new Set(Object.keys(environment ?? {}))) };
        }
        if (input.transport === 'http' || input.transport === 'sse') {
            rejectForbiddenFields(input, ['command', 'args', 'environment']);
            if (typeof input.url !== 'string')
                throw new Error(`${input.transport} MCP server ${id} requires a URL`);
            const rawUrl = nonEmpty(input.url, 'MCP URL');
            let url;
            try {
                url = new URL(rawUrl);
            }
            catch {
                throw new Error(`MCP server ${id} URL is invalid: ${rawUrl}`);
            }
            if (url.protocol !== 'http:' && url.protocol !== 'https:')
                throw new Error(`MCP server ${id} URL must use http or https`);
            const headers = input.headers === undefined ? undefined : staticHeaders(input.headers, id);
            return { id, key, transport: input.transport, url: rawUrl, ...(headers === undefined ? {} : { headers }), credentialRefs: credentialRefs(input, new Set(Object.keys(headers ?? {}))) };
        }
        throw new Error(`unsupported MCP transport for server ${id}`);
    });
}
function renderMcpServers(mcpSet) {
    const lines = [];
    for (const server of normalizedMcpServers(mcpSet)) {
        lines.push(`[mcp_servers.${server.key}]`);
        if (server.transport === 'stdio') {
            lines.push(`command = ${tomlString(server.command)}`);
            if (server.args !== undefined)
                lines.push(`args = ${JSON.stringify([...server.args])}`);
            if (server.environment !== undefined)
                lines.push(`env = ${JSON.stringify(server.environment)}`);
            if (server.credentialRefs.size > 0)
                lines.push(`env_vars = ${JSON.stringify([...server.credentialRefs.keys()])}`);
        }
        else {
            lines.push(`url = ${tomlString(server.url)}`);
            if (server.headers !== undefined)
                lines.push(`http_headers = ${JSON.stringify(server.headers)}`);
            if (server.credentialRefs.size > 0)
                lines.push(`env_http_headers = ${JSON.stringify(Object.fromEntries([...server.credentialRefs.keys()].map(target => [target, target])))}`);
        }
        lines.push('');
    }
    return lines;
}
/** Resolve MCP credentials into the child environment; config.toml only carries env names. */
export async function resolveCodexMcpEnvironment(mcpSet, resolver) {
    const targets = new Map();
    for (const server of normalizedMcpServers(mcpSet))
        for (const [target, reference] of server.credentialRefs) {
            const previous = targets.get(target);
            if (previous !== undefined && previous !== reference)
                throw new Error(`Codex MCP credential target is shared by different references: ${target}`);
            targets.set(target, reference);
        }
    const environment = {};
    await Promise.all([...targets.entries()].map(async ([target, reference]) => {
        let value;
        try {
            value = await resolver(reference);
        }
        catch {
            throw new Error(`Codex MCP credential resolution failed: ${reference}`);
        }
        if (typeof value !== 'string' || value.trim().length === 0)
            throw new Error(`Codex MCP credential resolution failed: ${reference}`);
        environment[target] = value;
    }));
    return environment;
}
export function renderCodexProviderConfig(input) {
    const providerName = nonEmpty(input.providerName, 'provider name'), baseUri = normalizeBaseUri(input.baseUri), apiKey = nonEmpty(input.apiKey, 'API key'), modelProvider = providerKey(providerName);
    return { configToml: [`model_provider = ${tomlString(modelProvider)}`, '', `[model_providers.${modelProvider}]`, `name = ${tomlString(providerName)}`, `base_url = ${tomlString(baseUri)}`, 'wire_api = "responses"', 'env_key = "OPENAI_API_KEY"', 'requires_openai_auth = true', '', '[shell_environment_policy]', 'inherit = "none"', '', ...renderMcpServers(input.mcpSet)].join('\n'), modelProvider, environment: { OPENAI_API_KEY: apiKey }, redactions: [apiKey] };
}
export function renderCodexConfig(input) {
    const providerName = nonEmpty(input.providerName, 'provider name'), baseUri = normalizeBaseUri(input.baseUri), model = nonEmpty(input.model, 'model'), apiKey = nonEmpty(input.apiKey, 'API key'), modelProvider = providerKey(providerName);
    return { configToml: [`model_provider = ${tomlString(modelProvider)}`, `model = ${tomlString(model)}`, '', `[model_providers.${modelProvider}]`, `name = ${tomlString(providerName)}`, `base_url = ${tomlString(baseUri)}`, 'wire_api = "responses"', 'env_key = "OPENAI_API_KEY"', 'requires_openai_auth = true', '', '[shell_environment_policy]', 'inherit = "none"', '', ...renderMcpServers(input.mcpSet)].join('\n'), modelProvider, environment: { OPENAI_API_KEY: apiKey }, redactions: [apiKey] };
}
//# sourceMappingURL=config.js.map