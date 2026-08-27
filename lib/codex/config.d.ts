import type { EngineMcpSet } from '../assets.js';
export interface CodexProviderRuntimeConfig {
    readonly providerName: string;
    readonly baseUri: string;
    readonly model: string;
    readonly apiKey: string;
    readonly mcpSet?: EngineMcpSet;
}
export interface CodexConfigMaterialization {
    readonly configToml: string;
    readonly modelProvider: string;
    readonly environment: Readonly<Record<string, string>>;
    readonly redactions: readonly string[];
}
export type CodexCredentialResolver = (credentialRef: string) => string | undefined | Promise<string | undefined>;
/** Resolve MCP credentials into the child environment; config.toml only carries env names. */
export declare function resolveCodexMcpEnvironment(mcpSet: EngineMcpSet | undefined, resolver: CodexCredentialResolver): Promise<Readonly<Record<string, string>>>;
export interface CodexProviderConfigMaterialization {
    readonly configToml: string;
    readonly modelProvider: string;
    readonly environment: Readonly<Record<string, string>>;
    readonly redactions: readonly string[];
}
export declare function renderCodexProviderConfig(input: {
    readonly providerName: string;
    readonly baseUri: string;
    readonly apiKey: string;
    readonly mcpSet?: EngineMcpSet;
}): CodexProviderConfigMaterialization;
export declare function renderCodexConfig(input: CodexProviderRuntimeConfig): CodexConfigMaterialization;
//# sourceMappingURL=config.d.ts.map