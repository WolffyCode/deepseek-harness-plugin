import { normalizeBaseUri } from './provider/types.js';
export function readDebugCodexProviderSeed(env) {
    const baseUri = env['DSH_DEBUG_CODEX_BASE_URI']?.trim();
    const apiKey = env['DSH_DEBUG_CODEX_API_KEY']?.trim();
    if (baseUri === undefined && apiKey === undefined)
        return undefined;
    if (baseUri === undefined || baseUri.length === 0) {
        throw new Error('DSH_DEBUG_CODEX_BASE_URI is required when Codex debug credentials are configured');
    }
    if (apiKey === undefined || apiKey.length === 0) {
        throw new Error('DSH_DEBUG_CODEX_API_KEY is required when Codex debug credentials are configured');
    }
    return {
        provider: {
            id: 'debug-sub2api-codex',
            engineId: 'codex-cli',
            name: 'Debug Codex Relay',
            baseUri: normalizeBaseUri(baseUri),
            credentialRef: 'debug-sub2api-codex',
            wireApi: 'responses',
            authMode: 'api-key',
        },
        apiKey,
    };
}
//# sourceMappingURL=debug-provider.js.map