export type ClaudeProviderPreflightFailureKind = 'endpoint-mismatch' | 'auth' | 'network' | 'protocol';
export interface ClaudeProviderPreflightOptions {
    readonly baseUri: string;
    readonly authToken: string;
    readonly model: string;
    readonly timeoutMs?: number;
}
export type ClaudeProviderPreflightResult = {
    readonly ok: true;
    readonly modelsStatus: number;
    readonly messagesStatus: number;
} | {
    readonly ok: false;
    readonly kind: ClaudeProviderPreflightFailureKind;
    readonly message: string;
};
/** Rejects every real Claude verification model that is not a GLM model or names Opus. */
export declare function assertClaudeRealModelAllowed(model: string): void;
/**
 * Verifies the Anthropic Messages API routes required by Claude Code.
 *
 * Claude Code uses the configured base URI with `GET /v1/models` for provider
 * discovery and `POST /v1/messages` for model requests. A successful models
 * response does not prove that the messages route exists, so both routes are
 * checked before starting a real Claude session. The messages probe sends an
 * invalid empty message list, allowing a reachable route to return validation
 * without consuming a model turn. Failures are classified as endpoint-mismatch,
 * auth, network, or protocol; no OpenAI-compatible route is accepted.
 */
export declare function preflightClaudeProvider(options: ClaudeProviderPreflightOptions): Promise<ClaudeProviderPreflightResult>;
//# sourceMappingURL=provider-preflight.d.ts.map