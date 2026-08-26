import { type Query, type SDKMessage, type Options as ClaudeSdkOptions } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeInputMessage, ClaudeQueryFactory } from './types.js';
export type ClaudeTransportEvent = {
    readonly type: 'message';
    readonly message: SDKMessage;
} | {
    readonly type: 'ended';
    readonly error?: Error;
};
export interface ClaudeTransport {
    readonly query: Query;
    subscribe(listener: (event: ClaudeTransportEvent) => void): () => void;
    send(message: ClaudeInputMessage): void;
    interrupt(): Promise<void>;
    close(): Promise<void>;
}
/**
 * Narrow credential redactor for the Claude error boundary. Replaces only this
 * session's exact credential values — authToken and the credential env entries
 * (ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY). Ordinary URIs, paths, and
 * diagnostic text pass through untouched, and a session without credentials
 * is a no-op.
 */
export declare class ClaudeCredentialRedactor {
    private readonly secrets;
    constructor(secrets: Iterable<string>);
    static fromAdapterOptions(options: {
        readonly authToken?: string;
        readonly environment?: Readonly<Record<string, string | undefined>>;
    }): ClaudeCredentialRedactor;
    redact(text: string): string;
    redactValue<T>(value: T): T;
    redactError(error: unknown): Error;
    private redactValueSeen;
    private redactErrorSeen;
}
export declare class ClaudeSdkTransport implements ClaudeTransport {
    private readonly input;
    private readonly listeners;
    private readonly redactor;
    readonly query: Query;
    private readonly pump;
    private closed;
    constructor(options: ClaudeSdkOptions, queryFactory?: ClaudeQueryFactory, redactor?: ClaudeCredentialRedactor);
    subscribe(listener: (event: ClaudeTransportEvent) => void): () => void;
    send(message: ClaudeInputMessage): void;
    interrupt(): Promise<void>;
    close(): Promise<void>;
    private consume;
    private emit;
}
//# sourceMappingURL=transport.d.ts.map