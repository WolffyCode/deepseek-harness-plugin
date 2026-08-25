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
    if (input.wireApi !== undefined && input.wireApi !== 'responses') {
        throw new Error('Codex v1 supports only the Responses API wire protocol');
    }
    if (input.authMode !== undefined && input.authMode !== 'api-key') {
        throw new Error('Codex v1 supports only API-key authentication');
    }
    return {
        id,
        engineId: input.engineId,
        name,
        baseUri: normalizeBaseUri(input.baseUri),
        credentialRef,
        wireApi: 'responses',
        authMode: 'api-key',
        enabled: true,
        status: 'unknown',
    };
}
//# sourceMappingURL=types.js.map