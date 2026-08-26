import type { EngineSuiteCatalogController } from './catalog.js';
import type { EngineSuiteSelectionRequest, EngineSuiteSwitchAgentRequest } from '../types.js';
export interface EngineSuiteComposerRuntime {
    readonly catalog: EngineSuiteCatalogController;
    readonly createAgent: (request: import('../types.js').EngineSuiteCreateAgentRequest) => Promise<void>;
    readonly openSession: (sessionId: string) => Promise<void>;
    readonly switchAgent: (request: EngineSuiteSwitchAgentRequest) => Promise<void>;
    readonly setSessionSelection: (sessionId: string, selection: EngineSuiteSelectionRequest) => void;
}
export declare function setEngineSuiteComposerRuntime(next: EngineSuiteComposerRuntime | undefined): void;
export declare function getEngineSuiteComposerRuntime(): EngineSuiteComposerRuntime | undefined;
export declare function setEngineSuiteSessionSelection(sessionId: string, selection: EngineSuiteSelectionRequest): void;
export declare function getEngineSuiteSessionSelection(sessionId: string): EngineSuiteSelectionRequest | undefined;
//# sourceMappingURL=composer-runtime.d.ts.map