import type { TypertGatewayBinding } from '@deepseek-ai/dsh-typert-protocol';
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { EngineSuiteCatalogView, EngineSuiteCreateAgentRequest, EngineSuiteCreateAgentResponse, EngineSuiteDiscoverModelsResponse, EngineSuiteSwitchAgentRequest, EngineSuiteSwitchAgentResponse, EngineSuiteCommandsResponse } from './types.js';
export type { EngineSuiteCatalogView, EngineSuiteCreateAgentRequest, EngineSuiteCreateAgentResponse, EngineSuiteDiscoverModelsResponse, EngineSuiteSwitchAgentRequest, EngineSuiteSwitchAgentResponse, EngineSuiteCommandView, EngineSuiteCommandsResponse, EngineSuiteProfileView, EngineSuiteSkillSetView, EngineSuiteMcpSetView, } from './types.js';
/** Host remote surface used by the client selector and settings UI. */
export declare class EngineSuiteGateway extends Service {
    static inject: string[];
    readonly typertRemote: TypertGatewayBinding<this>;
    private readonly engineSuite;
    constructor(ctx: Context);
    catalog(): Promise<EngineSuiteCatalogView>;
    private nativeCatalog;
    createAgent(request: EngineSuiteCreateAgentRequest): Promise<EngineSuiteCreateAgentResponse>;
    switchAgent(request: EngineSuiteSwitchAgentRequest): Promise<EngineSuiteSwitchAgentResponse>;
    sessionCommands(sessionId: string, refresh: boolean): Promise<EngineSuiteCommandsResponse>;
    discoverModels(providerId: string): Promise<EngineSuiteDiscoverModelsResponse>;
    cancelAgent(agentId: string): Promise<void>;
}
//# sourceMappingURL=remote.d.ts.map