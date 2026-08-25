import { type CreateProviderInput } from './provider/types.js';
export interface DebugCodexProviderSeed {
    readonly provider: CreateProviderInput;
    readonly apiKey: string;
}
export declare function readDebugCodexProviderSeed(env: Record<string, string | undefined>): DebugCodexProviderSeed | undefined;
//# sourceMappingURL=debug-provider.d.ts.map