import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { ENGINE_SUITE_SETTINGS_NAMESPACE, type EngineSuiteSettings } from '../settings.js'
import { EngineSuiteSection } from './EngineSuiteSection.js'

export const inject = ['slots', 'settingsScope']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'engine-suite',
    order: 20,
    label: 'Engines',
    inject: () => ({
      scope: ctx.settingsScope.bind<EngineSuiteSettings>({ namespace: ENGINE_SUITE_SETTINGS_NAMESPACE }),
    }),
  }, EngineSuiteSection))
}

export type { EngineSuiteSettings, SettingsScope }
