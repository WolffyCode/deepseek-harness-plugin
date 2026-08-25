import { discoverCodexModels } from './codex/discovery.js';
import { openCodexLaunch } from './codex/launch.js';
import { EngineRegistry, ModelCatalog, ProviderRegistry } from './registry.js';
import { resolveEngineProfile } from './profile/resolver.js';
export const CODEX_ENGINE = {
    id: 'codex-cli',
    type: 'codex-cli',
    displayName: 'Codex CLI',
    capabilities: {
        streaming: true,
        sessionResume: true,
        modelDiscovery: true,
        reasoningDiscovery: true,
        approvals: true,
        mcp: true,
        skills: true,
        backgroundAgent: false,
        steer: true,
        fork: false,
    },
};
export function createEngineSuiteRuntime() {
    const engines = new EngineRegistry();
    engines.register(CODEX_ENGINE);
    const providers = new ProviderRegistry();
    const models = new ModelCatalog();
    return {
        engines,
        providers,
        models,
        resolveProfile: selection => resolveEngineProfile({ engines, providers, models }, selection),
        discoverCodexModels: async (providerId, options) => {
            const provider = providers.get(providerId);
            const discovered = await discoverCodexModels({ ...options, provider });
            models.replaceProvider(providerId, discovered);
            return discovered;
        },
        openCodex: async (selection, options) => {
            const profile = resolveEngineProfile({ engines, providers, models }, selection);
            return openCodexLaunch({
                ...options,
                profile,
                provider: providers.get(profile.providerId),
                model: models.get(profile.modelRecordId),
            });
        },
    };
}
export function createEngineSuite() {
    return createEngineSuiteRuntime();
}
//# sourceMappingURL=engine-suite.js.map