import { normalizeBaseUri } from './provider/types.js';
export function readDebugCodexProviderSeed(env) {
    const baseUri = env['DSH_DEBUG_CODEX_BASE_URI']?.trim();
    const apiKey = env['DSH_DEBUG_CODEX_API_KEY']?.trim();
    if (baseUri === undefined || apiKey === undefined || baseUri.length === 0 || apiKey.length === 0)
        return undefined;
    return {
        provider: {
            id: 'debug-sub2api-codex', engineId: 'codex-cli', name: 'Debug Codex Relay',
            baseUri: normalizeBaseUri(baseUri), credentialRef: 'debug-sub2api-codex',
            wireApi: 'responses', authMode: 'api-key',
        },
        apiKey,
    };
}
/** Debug seed for the GLM provider; the token is read only from the environment. */
export function readDebugGlmProviderSeed(env) {
    const baseUri = env['DSH_DEBUG_GLM_BASE_URI']?.trim() ?? env['ANTHROPIC_BASE_URL']?.trim();
    const apiKey = env['DSH_DEBUG_GLM_AUTH_TOKEN']?.trim() ?? env['ANTHROPIC_AUTH_TOKEN']?.trim();
    if (baseUri === undefined || apiKey === undefined || baseUri.length === 0 || apiKey.length === 0)
        return undefined;
    return {
        provider: {
            id: 'glm-opencodebay', engineId: 'claude-cli', name: 'GLM (OpenCodeBay)',
            baseUri: normalizeBaseUri(baseUri), credentialRef: 'ANTHROPIC_AUTH_TOKEN',
            wireApi: 'anthropic', authMode: 'auth-token',
        },
        apiKey,
    };
}
//# sourceMappingURL=debug-provider.js.map