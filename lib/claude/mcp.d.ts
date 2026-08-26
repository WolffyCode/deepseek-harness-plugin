import type { McpHttpServerConfig, McpSSEServerConfig, McpStdioServerConfig, Options as ClaudeSdkOptions } from '@anthropic-ai/claude-agent-sdk';
/** Canonical transports accepted by the Claude asset materializer. */
export type CanonicalMcpTransport = 'stdio' | 'http' | 'sse';
/** Asset ownership is explicit so Harness-owned connections cannot enter user config. */
export type ClaudeAssetScope = 'user' | 'internal' | 'harness';
export interface CanonicalMcpServerBase {
    readonly name: string;
    readonly transport: CanonicalMcpTransport;
    readonly scope?: ClaudeAssetScope;
    readonly alwaysLoad?: boolean;
    /** Map of target env/header names to runtime-only credential references. */
    readonly credentialRefs?: Readonly<Record<string, string>>;
}
export type CanonicalStdioMcpServer = CanonicalMcpServerBase & {
    readonly transport: 'stdio';
    readonly command: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    readonly url?: never;
    readonly headers?: never;
};
export type CanonicalHttpMcpServer = CanonicalMcpServerBase & {
    readonly transport: 'http';
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly command?: never;
    readonly args?: never;
    readonly env?: never;
};
export type CanonicalSseMcpServer = CanonicalMcpServerBase & {
    readonly transport: 'sse';
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly command?: never;
    readonly args?: never;
    readonly env?: never;
};
export type CanonicalMcpServer = CanonicalStdioMcpServer | CanonicalHttpMcpServer | CanonicalSseMcpServer;
export interface CanonicalMcpSet {
    readonly scope?: ClaudeAssetScope;
    readonly servers: readonly CanonicalMcpServer[];
}
export interface ClaudeCredentialResolver {
    resolve(reference: string): string | undefined;
}
export interface ClaudeMcpSdkSupport {
    readonly stdio: boolean;
    readonly http: boolean;
    readonly sse: boolean;
}
/**
 * Evidence-backed capability declaration for SDK 0.3.246: all three process
 * transports are present in the installed SDK declarations.
 */
export declare const CLAUDE_MCP_SDK_SUPPORT: ClaudeMcpSdkSupport;
export interface ClaudeMcpMaterializeOptions {
    readonly credentialResolver?: ClaudeCredentialResolver;
    readonly sdkSupport?: Partial<ClaudeMcpSdkSupport>;
}
export type ClaudeSdkMcpServerConfig = McpStdioServerConfig | McpHttpServerConfig | McpSSEServerConfig;
export type ClaudeMcpOptionsFragment = Readonly<Pick<ClaudeSdkOptions, 'mcpServers'>>;
export type ClaudeAssetErrorCode = 'CLAUDE_ASSET_SCOPE_FORBIDDEN' | 'MCP_INVALID_CONFIG' | 'MCP_INVALID_NAME' | 'MCP_INVALID_TRANSPORT' | 'MCP_INVALID_URL' | 'MCP_INVALID_FIELD' | 'MCP_CONFLICTING_FIELDS' | 'MCP_DUPLICATE_NAME' | 'MCP_CREDENTIAL_RESOLVER_MISSING' | 'MCP_CREDENTIAL_MISSING' | 'MCP_CREDENTIAL_RESOLUTION_FAILED' | 'MCP_SDK_UNSUPPORTED_TRANSPORT';
export declare class ClaudeAssetMaterializationError extends Error {
    readonly code: ClaudeAssetErrorCode;
    readonly path: string;
    constructor(code: ClaudeAssetErrorCode, path: string, detail: string);
}
/**
 * Materializes user-owned canonical MCP assets into transient Claude SDK
 * process-transport configs. Resolved credential values exist only in this
 * runtime object; canonical inputs never contain them and are never mutated.
 */
export declare function materializeClaudeMcp(input: unknown, options?: ClaudeMcpMaterializeOptions): Readonly<Record<string, ClaudeSdkMcpServerConfig>>;
/** Returns the only SDK options fragment allowed to cross the Claude boundary for MCP assets. */
export declare function materializeClaudeMcpOptions(input: unknown, options?: ClaudeMcpMaterializeOptions): ClaudeMcpOptionsFragment;
//# sourceMappingURL=mcp.d.ts.map