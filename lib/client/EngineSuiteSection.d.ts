import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import { type ReactElement } from 'react';
import type { EngineSuiteSettings } from '../settings.js';
export interface EngineSuiteSectionProps {
    readonly close: () => void;
    readonly scope: SettingsScope<EngineSuiteSettings>;
}
export declare function EngineSuiteSection({ scope }: EngineSuiteSectionProps): ReactElement;
//# sourceMappingURL=EngineSuiteSection.d.ts.map