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
/** Render the minimal Codex provider config without embedding an API key. */
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