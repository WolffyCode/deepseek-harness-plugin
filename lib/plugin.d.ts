import type { Context } from '@deepseek-ai/cordis';
import type { EngineSuite } from './engine-suite.js';
import { EngineSuiteAgentService } from './agent/service.js';
import { EngineSuiteGateway } from './remote.js';
/** One installed bundle entry; child capabilities are owned by this plugin. */
export declare const inject: string[];
export interface EngineSuitePluginConfig {
    readonly primary?: boolean;
}
export declare function apply(ctx: Context, config?: EngineSuitePluginConfig): void;
export interface EngineSuiteService extends EngineSuite {
}
export interface EngineSuiteRuntimeService extends EngineSuiteService {
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