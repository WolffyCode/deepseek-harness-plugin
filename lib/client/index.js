import { ENGINE_SUITE_SETTINGS_NAMESPACE } from '../settings.js';
import { EngineSuiteSection } from './EngineSuiteSection.js';
export const inject = ['slots', 'settingsScope'];
export function apply(ctx) {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'engine-suite',
        order: 20,
        label: 'Engines',
        inject: () => ({
            scope: ctx.settingsScope.bind({ namespace: ENGINE_SUITE_SETTINGS_NAMESPACE }),
        }),
    }, EngineSuiteSection));
}
//# sourceMappingURL=index.js.map