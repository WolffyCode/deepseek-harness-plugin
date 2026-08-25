import type { TypertGatewayBinding } from '@deepseek-ai/dsh-typert-protocol';
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { EngineSuiteService } from './plugin.js';
import type { EngineSelection } from './profile/types.js';
export interface EngineSuiteCatalogView {
    readonly engines: readonly unknown[];
    readonly providers: readonly unknown[];
    readonly models: readonly unknown[];
}
export interface EngineSuiteCreateAgentRequest {
    readonly sessionId: string;
    readonly selection: EngineSelection;
    readonly cwd: string;
}
export interface EngineSuiteCreateAgentResponse {
    readonly sessionId: string;
    readonly agentId: string;
    readonly profileId: string;
}
/** Host remote surface used by the client selector and settings UI. */
export declare class EngineSuiteGateway extends Service {
    static inject: string[];
    readonly typertRemote: TypertGatewayBinding<this>;
    readonly engineSuite: EngineSuiteService;
    constructor(ctx: Context);
    catalog(): EngineSuiteCatalogView;
    createAgent(request: EngineSuiteCreateAgentRequest): Promise<EngineSuiteCreateAgentResponse>;
    cancelAgent(agentId: string): Promise<void>;
    private resolveApiKey;
}
//# sourceMappingURL=remote.d.ts.map