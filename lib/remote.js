var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { bindTypertRemote, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { Service } from '@deepseek-ai/cordis';
/** Host remote surface used by the client selector and settings UI. */
let EngineSuiteGateway = (() => {
    let _classSuper = Service;
    let _instanceExtraInitializers = [];
    let _catalog_decorators;
    let _createAgent_decorators;
    let _cancelAgent_decorators;
    return class EngineSuiteGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _catalog_decorators = [Remote('catalog')];
            _createAgent_decorators = [Remote('createAgent')];
            _cancelAgent_decorators = [Remote('cancelAgent')];
            __esDecorate(this, null, _catalog_decorators, { kind: "method", name: "catalog", static: false, private: false, access: { has: obj => "catalog" in obj, get: obj => obj.catalog }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createAgent_decorators, { kind: "method", name: "createAgent", static: false, private: false, access: { has: obj => "createAgent" in obj, get: obj => obj.createAgent }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelAgent_decorators, { kind: "method", name: "cancelAgent", static: false, private: false, access: { has: obj => "cancelAgent" in obj, get: obj => obj.cancelAgent }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['engineSuite'];
        typertRemote = (__runInitializers(this, _instanceExtraInitializers), bindTypertRemote(this, 'engineSuiteGateway'));
        constructor(ctx) {
            super(ctx, 'engineSuiteGateway');
            this.engineSuite = ctx.get('engineSuite');
        }
        catalog() {
            return {
                engines: this.engineSuite.engines.list(),
                providers: this.engineSuite.providers.list(),
                models: this.engineSuite.models.list(),
            };
        }
        async createAgent(request) {
            const profile = this.engineSuite.resolveProfile(request.selection);
            const provider = this.engineSuite.providers.get(profile.providerId);
            const apiKey = this.resolveApiKey(provider.credentialRef);
            const handle = await this.engineSuite.agents.createCodex({
                sessionId: request.sessionId,
                selection: request.selection,
                apiKey,
                cwd: request.cwd,
            });
            return {
                sessionId: String(handle.session.id),
                agentId: String(handle.agent.id),
                profileId: handle.profileId,
            };
        }
        async cancelAgent(agentId) {
            const handle = this.engineSuite.agents.list().find(candidate => String(candidate.agent.id) === agentId);
            if (handle === undefined)
                throw new Error(`unknown engine-suite agent: ${agentId}`);
            handle.agent.cancel({ kind: 'user' });
        }
        resolveApiKey(credentialRef) {
            const envKey = process.env[credentialRef]
                ?? (credentialRef === 'debug-sub2api-codex' ? process.env['DSH_DEBUG_CODEX_API_KEY'] : undefined)
                ?? process.env['OPENAI_API_KEY'];
            if (envKey === undefined || envKey.trim() === '') {
                throw new Error(`credential is not available for provider reference: ${credentialRef}`);
            }
            return envKey;
        }
    };
})();
export { EngineSuiteGateway };
//# sourceMappingURL=remote.js.map