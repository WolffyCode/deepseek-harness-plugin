import { createEngineSuiteRuntime } from './engine-suite.js';
import { EngineSuiteAgentService } from './agent/service.js';
import { registerEngineSuiteSettings } from './settings.js';
import { EngineSuiteGateway } from './remote.js';
/** Minimal Host-facing shape used by the bundle entry. Cordis Context satisfies it. */
/** One installed bundle entry; child capabilities are owned by this plugin. */
export function apply(ctx) {
    registerEngineSuiteSettings(ctx);
    const suite = createEngineSuiteRuntime();
    const agents = new EngineSuiteAgentService(ctx, suite);
    const service = Object.assign(suite, { agents });
    ctx.provide('engineSuite', service);
    ctx.plugin(EngineSuiteGateway);
}
//# sourceMappingURL=plugin.js.map