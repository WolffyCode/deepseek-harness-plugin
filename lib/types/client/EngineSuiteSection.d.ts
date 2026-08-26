import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import { type ReactElement } from 'react';
import type { EngineSuiteCatalogController } from './catalog.js';
import type { EngineSuiteSettings } from '../settings.js';
export interface EngineSuiteSectionProps {
    readonly close: () => void;
    readonly scope: SettingsScope<EngineSuiteSettings>;
    readonly catalog: EngineSuiteCatalogController;
}
export declare function EngineSuiteSection({ scope, catalog: controller }: EngineSuiteSectionProps): ReactElement;
//# sourceMappingURL=EngineSuiteSection.d.ts.map