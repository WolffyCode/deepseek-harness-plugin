import type { Context } from '@deepseek-ai/cordis'

interface ResolvedCredentialLike {
  readonly value: string
}

interface CredentialProviderLike {
  resolve(ref: string): Promise<ResolvedCredentialLike | undefined>
}

/** Resolve a credential reference through Harness credentials first, then debug environment fallback. */
export async function resolveApiKey(ctx: Context, credentialRef: string): Promise<string> {
  const credentials = ctx.get('credentials') as CredentialProviderLike | undefined
  const resolved = await credentials?.resolve(credentialRef)
  const envKey = resolved?.value
    ?? process.env[credentialRef]
    ?? (credentialRef === 'debug-sub2api-codex' ? process.env['DSH_DEBUG_CODEX_API_KEY'] : undefined)
    ?? (credentialRef === 'ANTHROPIC_AUTH_TOKEN' ? process.env['DSH_DEBUG_GLM_AUTH_TOKEN'] : undefined)
    ?? process.env['OPENAI_API_KEY']
  if (envKey === undefined || envKey.trim() === '') {
    throw new Error(`credential is not available for provider reference: ${credentialRef}`)
  }
  return envKey
}
