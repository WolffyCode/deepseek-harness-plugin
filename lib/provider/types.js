export function normalizeBaseUri(baseUri) {
    const value = baseUri.trim();
    if (value.length === 0)
        throw new Error('provider base URI must not be empty');
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error(`provider base URI is invalid: ${value}`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('provider base URI must use http or https');
    }
    return url.toString().replace(/\/$/, '');
}
export function createProvider(input) {
    const id = input.id.trim();
    const name = input.name.trim();
    const credentialRef = input.credentialRef.trim();
    if (id.length === 0)
        throw new Error('provider id must not be empty');
    if (name.length === 0)
        throw new Error('provider name must not be empty');
    if (credentialRef.length === 0)
        throw new Error('provider credential reference must not be empty');
    const wireApi = input.wireApi ?? (input.engineId === 'claude-cli' ? 'anthropic' : 'responses');
    const authMode = input.authMode ?? (input.engineId === 'claude-cli' ? 'auth-token' : 'api-key');
    if (input.engineId === 'codex-cli' && wireApi !== 'responses') {
        throw new Error('Codex CLI requires the Responses API wire protocol');
    }
    if (input.engineId === 'claude-cli' && wireApi !== 'anthropic') {
        throw new Error('Claude CLI requires the Anthropic wire protocol');
    }
    if (authMode !== 'api-key' && authMode !== 'auth-token') {
        throw new Error('unsupported provider authentication mode');
    }
    return {
        id,
        engineId: input.engineId,
        name,
        baseUri: normalizeBaseUri(input.baseUri),
        credentialRef,
        wireApi,
        authMode,
        enabled: input.enabled ?? true,
        status: 'unknown',
    };
}
//# sourceMappingURL=types.js.map