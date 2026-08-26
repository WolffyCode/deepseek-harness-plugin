import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { EngineSuiteRuntime } from './engine-suite.js';
import type { EngineMcpTransport, EngineSkillSet } from './assets.js';
export declare const ENGINE_SUITE_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
export interface EngineSuiteProviderSettings {
    readonly id: string;
    readonly engineId: string;
    readonly name: string;
    readonly baseUri: string;
    readonly credentialRef: string;
    readonly wireApi: 'responses' | 'anthropic';
    readonly authMode: 'api-key' | 'auth-token';
    readonly enabled: boolean;
}
export interface EngineSuiteModelSettings {
    readonly id: string;
    readonly engineId: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly displayName?: string;
    readonly enabled: boolean;
    readonly hidden: boolean;
    readonly reasoningOptions: string[];
    readonly defaultReasoningEffort?: string;
    readonly contextWindowTokens?: number;
    readonly contextWindowSource: 'discovered' | 'manual' | 'unknown';
}
export type EngineSuiteSkillSetSettings = EngineSkillSet;
/**
 * Raw settings input is intentionally transport-shaped rather than the
 * validated runtime union. The schema below is the single boundary that
 * rejects cross-transport fields before sync materializes EngineMcpServer.
 */
export interface EngineSuiteMcpServerSettings {
    readonly id: string;
    readonly name: string;
    readonly transport: EngineMcpTransport;
    readonly command?: string;
    readonly args?: string[];
    readonly environment?: Record<string, string>;
    readonly url?: string;
    readonly headers?: Record<string, string>;
    readonly credentialRefs?: Record<string, string>;
}
export interface EngineSuiteMcpSetSettings {
    readonly id: string;
    readonly servers: EngineSuiteMcpServerSettings[];
}
export interface EngineSuiteProfileSettings {
    readonly id: string;
    readonly name?: string;
    readonly engineId: string;
    readonly providerId: string;
    readonly modelRecordId: string;
    readonly reasoningEffort?: string;
    readonly skillSetRef?: string;
    readonly mcpSetRef?: string;
    readonly allowedChildProfiles: string[];
    readonly maxChildDepth: number;
    readonly maxConcurrentChildren: number;
    readonly enabled: boolean;
}
export interface EngineSuiteSettings {
    readonly providers: EngineSuiteProviderSettings[];
    readonly models: EngineSuiteModelSettings[];
    readonly profiles?: EngineSuiteProfileSettings[];
    readonly skillSets?: EngineSuiteSkillSetSettings[];
    readonly mcpSets?: EngineSuiteMcpSetSettings[];
}
export declare const EngineSuiteSettingsSchema: z<EngineSuiteSettings>;
/**
 * Replace the process-local runtime catalog from the persisted settings view.
 * Credentials remain references; this function never reads or stores a secret.
 */
export declare function syncEngineSuiteSettings(suite: EngineSuiteRuntime, value: EngineSuiteSettings): void;
/** Register and live-sync the persisted catalog namespace when settings is present. */
export declare function registerEngineSuiteSettings(ctx: Context, onChange?: (value: EngineSuiteSettings) => void, afterReady?: () => void, base?: Partial<EngineSuiteSettings>): void;
//# sourceMappingURL=settings.d.ts.map