import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const ENGINE_SUITE_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
export interface EngineSuiteProviderSettings {
    readonly id: string;
    readonly engineId: string;
    readonly name: string;
    readonly baseUri: string;
    readonly credentialRef: string;
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
export interface EngineSuiteSettings {
    readonly providers: EngineSuiteProviderSettings[];
    readonly models: EngineSuiteModelSettings[];
}
export declare const EngineSuiteSettingsSchema: z<EngineSuiteSettings>;
/** Register the persisted catalog namespace when a settings provider is present. */
export declare function registerEngineSuiteSettings(ctx: Context): void;
//# sourceMappingURL=settings.d.ts.map