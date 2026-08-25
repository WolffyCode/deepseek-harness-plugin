import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const ENGINE_SUITE_SETTINGS_NAMESPACE = settingsNamespace('engine-suite')

export interface EngineSuiteProviderSettings {
  readonly id: string
  readonly engineId: string
  readonly name: string
  readonly baseUri: string
  readonly credentialRef: string
  readonly enabled: boolean
}

export interface EngineSuiteModelSettings {
  readonly id: string
  readonly engineId: string
  readonly providerId: string
  readonly modelId: string
  readonly displayName?: string
  readonly enabled: boolean
  readonly hidden: boolean
  readonly reasoningOptions: string[]
  readonly defaultReasoningEffort?: string
  readonly contextWindowTokens?: number
  readonly contextWindowSource: 'discovered' | 'manual' | 'unknown'
}

export interface EngineSuiteSettings {
  readonly providers: EngineSuiteProviderSettings[]
  readonly models: EngineSuiteModelSettings[]
}

export const EngineSuiteSettingsSchema: z<EngineSuiteSettings> = z.object({
  providers: z.array(z.object({
    id: z.string().min(1),
    engineId: z.string().min(1),
    name: z.string().min(1),
    baseUri: z.string().min(1),
    credentialRef: z.string().min(1),
    enabled: z.boolean().default(true),
  })).default([]),
  models: z.array(z.object({
    id: z.string().min(1),
    engineId: z.string().min(1),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    displayName: z.string(),
    enabled: z.boolean().default(true),
    hidden: z.boolean().default(false),
    reasoningOptions: z.array(z.string()).default([]),
    defaultReasoningEffort: z.string(),
    contextWindowTokens: z.number().step(1).min(1),
    contextWindowSource: z.union([
      z.const('discovered'),
      z.const('manual'),
      z.const('unknown'),
    ]).default('unknown'),
  })).default([]),
})

/** Register the persisted catalog namespace when a settings provider is present. */
export function registerEngineSuiteSettings(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(ENGINE_SUITE_SETTINGS_NAMESPACE, EngineSuiteSettingsSchema, {
      applies: 'live',
    })
  })
}
