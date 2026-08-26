/** Resolve a credential reference through Harness credentials first, then debug environment fallback. */
export async function resolveApiKey(ctx, credentialRef) {
    const credentials = ctx.get('credentials');
    const resolved = await credentials?.resolve(credentialRef);
    const envKey = resolved?.value
        ?? process.env[credentialRef]
        ?? (credentialRef === 'debug-sub2api-codex' ? process.env['DSH_DEBUG_CODEX_API_KEY'] : undefined)
        ?? (credentialRef === 'ANTHROPIC_AUTH_TOKEN' ? process.env['DSH_DEBUG_GLM_AUTH_TOKEN'] : undefined)
        ?? process.env['OPENAI_API_KEY'];
    if (envKey === undefined || envKey.trim() === '') {
        throw new Error(`credential is not available for provider reference: ${credentialRef}`);
    }
    return envKey;
}
//# sourceMappingURL=credential.js.map