import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { EngineSuiteSettings } from '../settings.js';
/** The root half only needs the Remote service so it can mount this package's contribution. */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
export type { EngineSuiteSettings, SettingsScope };
//# sourceMappingURL=index.d.ts.map