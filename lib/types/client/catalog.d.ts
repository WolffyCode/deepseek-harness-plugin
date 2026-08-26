import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { EngineSuiteCatalogView, EngineSuiteCreateAgentRequest, EngineSuiteCreateAgentResponse, EngineSuiteSwitchAgentRequest, EngineSuiteSwitchAgentResponse, EngineSuiteDiscoverModelsResponse, EngineSuiteCommandsResponse } from '../types.js';
export interface EngineSuiteRemoteGateway {
    catalog(): Promise<RemoteResult<EngineSuiteCatalogView>>;
    discoverModels(providerId: string): Promise<RemoteResult<EngineSuiteDiscoverModelsResponse>>;
    createAgent(request: EngineSuiteCreateAgentRequest): Promise<RemoteResult<EngineSuiteCreateAgentResponse>>;
    switchAgent(request: EngineSuiteSwitchAgentRequest): Promise<RemoteResult<EngineSuiteSwitchAgentResponse>>;
    sessionCommands(sessionId: string, refresh: boolean): Promise<RemoteResult<EngineSuiteCommandsResponse>>;
}
export interface EngineSuiteCatalogSnapshot {
    readonly status: 'idle' | 'loading' | 'ready' | 'error';
    readonly catalog: EngineSuiteCatalogView | null;
    readonly error: string | null;
}
export interface EngineSuiteCatalogController {
    getSnapshot(): EngineSuiteCatalogSnapshot;
    subscribe(listener: () => void): () => void;
    refresh(): Promise<EngineSuiteCatalogView>;
    discoverModels(providerId: string): Promise<readonly EngineSuiteDiscoverModelsResponse['models'][number][]>;
    createAgent(request: EngineSuiteCreateAgentRequest): Promise<EngineSuiteCreateAgentResponse>;
    switchAgent(request: EngineSuiteSwitchAgentRequest): Promise<EngineSuiteSwitchAgentResponse>;
    listCommands(sessionId: string, refresh?: boolean): Promise<readonly EngineSuiteCommandsResponse['commands'][number][]>;
}
export declare function createEngineSuiteCatalogController(remote: EngineSuiteRemoteGateway): EngineSuiteCatalogController;
//# sourceMappingURL=catalog.d.ts.map