import type { LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { EngineSuiteRuntime } from './engine-suite.js';
/** Keep the LLM provider registry aware of active external Engine routes. */
export declare class ExternalEngineLlmRouteRegistration {
    private readonly llm;
    private readonly suite;
    private registration;
    private readonly adapter;
    constructor(llm: LlmRuntime, suite: EngineSuiteRuntime);
    sync(): void;
    dispose(): void;
}
//# sourceMappingURL=llm-route.d.ts.map