import { type CreateProviderInput } from './provider/types.js';
export interface DebugCodexProviderSeed {
    readonly provider: CreateProviderInput;
    readonly apiKey: string;
}
export interface DebugClaudeProviderSeed {
    readonly provider: CreateProviderInput;
    readonly apiKey: string;
}
export declare function readDebugCodexProviderSeed(env: Record<string, string | undefined>): DebugCodexProviderSeed | undefined;
/** Debug seed for the GLM provider; the token is read only from the environment. */
export declare function readDebugGlmProviderSeed(env: Record<string, string | undefined>): DebugClaudeProviderSeed | undefined;
//# sourceMappingURL=debug-provider.d.ts.map