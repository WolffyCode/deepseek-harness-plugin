import { LlmAdapter } from '@deepseek-ai/dsh-llm';
/**
 * Advertises externally-driven local Engine routes to Harness's API route guard.
 * Actual generation never enters this adapter: ExternalEngineAgent owns the
 * local app-server process and projects its output into the Session log.
 */
class ExternalEngineRouteAdapter extends LlmAdapter {
    suite;
    constructor(suite) {
        super();
        this.suite = suite;
    }
    providerInfo(provider) {
        return { id: provider, name: this.suite.providers.get(provider).name };
    }
    listModels(provider) {
        return Promise.resolve(this.suite.models.list(provider).map(model => ({
            provider,
            id: model.modelId,
            name: model.displayName ?? model.modelId,
            ...model.description === undefined ? {} : { description: model.description },
        })));
    }
    resolveModel(provider, model) {
        const record = this.suite.models.list(provider).find(candidate => candidate.modelId === model);
        return Promise.resolve({
            provider,
            id: model,
            name: record?.displayName ?? model,
            ...record?.description === undefined ? {} : { description: record.description },
        });
    }
    async *stream(_options) {
        throw new Error('External Engine routes are driven by the Engine Suite app-server Agent, not Harness LLM stream');
    }
}
/** Keep the LLM provider registry aware of active external Engine routes. */
export class ExternalEngineLlmRouteRegistration {
    llm;
    suite;
    registration;
    adapter;
    constructor(llm, suite) {
        this.llm = llm;
        this.suite = suite;
        this.adapter = new ExternalEngineRouteAdapter(suite);
    }
    sync() {
        const providers = this.suite.providers.list()
            .filter(provider => provider.enabled)
            .map(provider => provider.id);
        if (this.registration === undefined) {
            if (providers.length === 0)
                return;
            this.registration = this.llm.registerAdapter(providers, this.adapter);
            return;
        }
        this.registration.replace(providers);
    }
    dispose() {
        this.registration?.();
        this.registration = undefined;
    }
}
//# sourceMappingURL=llm-route.js.map