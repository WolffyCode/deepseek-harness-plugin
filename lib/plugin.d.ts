import type { Context } from '@deepseek-ai/cordis';
import type { EngineSuite } from './engine-suite.js';
import { EngineSuiteAgentService } from './agent/service.js';
import { EngineSuiteGateway } from './remote.js';
/** Minimal Host-facing shape used by the bundle entry. Cordis Context satisfies it. */
/** One installed bundle entry; child capabilities are owned by this plugin. */
export declare function apply(ctx: Context): void;
export interface EngineSuiteService extends EngineSuite {
    readonly agents: EngineSuiteAgentService;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        engineSuite: EngineSuiteService;
        engineSuiteGateway: EngineSuiteGateway;
    }
}
export type { EngineSuite };
//# sourceMappingURL=plugin.d.ts.map