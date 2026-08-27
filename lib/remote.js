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
import { resolveApiKey } from './credential.js';
import { SessionId } from '@deepseek-ai/dsh-session';
/** Host remote surface used by the client selector and settings UI. */
let EngineSuiteGateway = (() => {
    let _classSuper = Service;
    let _instanceExtraInitializers = [];
    let _catalog_decorators;
    let _createAgent_decorators;
    let _switchAgent_decorators;
    let _sessionCommands_decorators;
    let _discoverModels_decorators;
    let _cancelAgent_decorators;
    return class EngineSuiteGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _catalog_decorators = [Remote('catalog')];
            _createAgent_decorators = [Remote('createAgent')];
            _switchAgent_decorators = [Remote('switchAgent')];
            _sessionCommands_decorators = [Remote('sessionCommands')];
            _discoverModels_decorators = [Remote('discoverModels')];
            _cancelAgent_decorators = [Remote('cancelAgent')];
            __esDecorate(this, null, _catalog_decorators, { kind: "method", name: "catalog", static: false, private: false, access: { has: obj => "catalog" in obj, get: obj => obj.catalog }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createAgent_decorators, { kind: "method", name: "createAgent", static: false, private: false, access: { has: obj => "createAgent" in obj, get: obj => obj.createAgent }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _switchAgent_decorators, { kind: "method", name: "switchAgent", static: false, private: false, access: { has: obj => "switchAgent" in obj, get: obj => obj.switchAgent }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _sessionCommands_decorators, { kind: "method", name: "sessionCommands", static: false, private: false, access: { has: obj => "sessionCommands" in obj, get: obj => obj.sessionCommands }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _discoverModels_decorators, { kind: "method", name: "discoverModels", static: false, private: false, access: { has: obj => "discoverModels" in obj, get: obj => obj.discoverModels }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelAgent_decorators, { kind: "method", name: "cancelAgent", static: false, private: false, access: { has: obj => "cancelAgent" in obj, get: obj => obj.cancelAgent }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['engineSuite'];
        typertRemote = (__runInitializers(this, _instanceExtraInitializers), bindTypertRemote(this, 'engineSuiteGateway'));
        engineSuite;
        constructor(ctx) {
            super(ctx, 'engineSuiteGateway');
            this.engineSuite = ctx.get('engineSuite');
        }
        async catalog() {
            const ownEngines = this.engineSuite.engines.list().map(engine => ({
                id: engine.id,
                type: engine.type,
                displayName: engine.displayName,
                capabilities: { ...engine.capabilities },
            }));
            const ownProviders = this.engineSuite.providers.list().map(provider => ({
                id: provider.id,
                engineId: provider.engineId,
                name: provider.name,
                baseUri: provider.baseUri,
                wireApi: provider.wireApi,
                authMode: provider.authMode,
                enabled: provider.enabled,
                status: provider.status,
            }));
            const ownModels = this.engineSuite.models.list().map(model => ({
                id: model.id,
                engineId: model.engineId,
                providerId: model.providerId,
                modelId: model.modelId,
                ...model.displayName === undefined ? {} : { displayName: model.displayName },
                ...model.description === undefined ? {} : { description: model.description },
                enabled: model.enabled,
                hidden: model.hidden,
                reasoningOptions: model.reasoningOptions.map(option => ({
                    id: option.id,
                    ...option.description === undefined ? {} : { description: option.description },
                })),
                ...model.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
                inputModalities: [...model.inputModalities],
                ...model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens },
                contextWindowSource: model.contextWindowSource,
                source: model.source,
            }));
            const ownProfiles = this.engineSuite.profiles.list().map(profile => ({
                id: profile.id,
                name: profile.name ?? profile.id,
                engineId: profile.selection.engineId,
                providerId: profile.selection.providerId,
                modelRecordId: profile.selection.modelRecordId,
                ...profile.selection.reasoningEffort === undefined ? {} : { reasoningEffort: profile.selection.reasoningEffort },
                ...profile.skillSetRef === undefined ? {} : { skillSetRef: profile.skillSetRef },
                ...profile.mcpSetRef === undefined ? {} : { mcpSetRef: profile.mcpSetRef },
                allowedChildProfiles: [...profile.allowedChildProfiles ?? []],
                maxChildDepth: profile.maxChildDepth ?? 1,
                maxConcurrentChildren: profile.maxConcurrentChildren ?? 1,
                enabled: profile.enabled !== false,
            }));
            const skillSets = this.engineSuite.assets.listSkillSets().map(set => ({
                id: set.id, pluginDirs: [...set.pluginDirs], additionalDirectories: [...set.additionalDirectories],
            }));
            const mcpSets = this.engineSuite.assets.listMcpSets().map(set => ({
                id: set.id,
                servers: set.servers.map(server => ({ id: server.id, name: server.name, transport: server.transport })),
            }));
            const native = await this.nativeCatalog(new Set(ownProviders.map(provider => provider.id)));
            return {
                engines: [...ownEngines, native.engine],
                providers: [...ownProviders, ...native.providers],
                models: [...ownModels, ...native.models],
                profiles: ownProfiles,
                skillSets,
                mcpSets,
            };
        }
        async nativeCatalog(ownProviderIds) {
            const engine = {
                id: 'deepseek-native',
                type: 'deepseek-native',
                displayName: 'DeepSeek 内置',
                capabilities: {
                    streaming: true, sessionResume: true, modelDiscovery: true, reasoningDiscovery: true,
                    approvals: true, mcp: true, skills: true, backgroundAgent: true, steer: true, fork: true,
                },
            };
            const llm = this.ctx.get('llm');
            if (llm === undefined)
                return { engine, providers: [], models: [] };
            const providers = [];
            const models = [];
            for (const provider of llm.listProviders()) {
                if (ownProviderIds.has(provider.id))
                    continue;
                providers.push({
                    id: provider.id,
                    engineId: engine.id,
                    name: provider.name,
                    baseUri: '',
                    wireApi: 'responses',
                    authMode: 'api-key',
                    enabled: true,
                    status: 'available',
                });
                let advertised;
                try {
                    advertised = await llm.listModels(provider.id);
                }
                catch {
                    advertised = [];
                }
                for (const model of advertised) {
                    let exact;
                    try {
                        exact = await llm.resolveModelInfo(provider.id, model.id);
                    }
                    catch {
                        exact = undefined;
                    }
                    const reasoningOptions = exact?.reasoning?.efforts ?? [];
                    models.push({
                        id: `${provider.id}/${model.id}`,
                        engineId: engine.id,
                        providerId: provider.id,
                        modelId: model.id,
                        displayName: exact?.name ?? model.name,
                        ...exact?.description ?? model.description
                            ? { description: exact?.description ?? model.description }
                            : {},
                        enabled: true,
                        hidden: false,
                        reasoningOptions: reasoningOptions.map(option => ({ id: option.id, ...option.description === undefined ? {} : { description: option.description } })),
                        ...exact?.reasoning?.defaultEffort === undefined ? {} : { defaultReasoningEffort: exact.reasoning.defaultEffort },
                        inputModalities: [...exact?.inputModalities ?? model.inputModalities ?? ['text']],
                        ...exact?.context?.contextWindow === undefined ? {} : { contextWindowTokens: exact.context.contextWindow },
                        contextWindowSource: exact?.context?.contextWindow === undefined ? 'unknown' : 'discovered',
                        source: 'discovered',
                    });
                }
            }
            return { engine, providers, models };
        }
        async createAgent(request) {
            const selection = {
                engineId: request.selection.engineId,
                providerId: request.selection.providerId,
                modelRecordId: request.selection.modelRecordId,
                ...request.selection.reasoningEffort === undefined
                    ? {}
                    : { reasoningEffort: request.selection.reasoningEffort },
            };
            const profile = this.engineSuite.resolveProfile(selection);
            const provider = this.engineSuite.providers.get(profile.providerId);
            const apiKey = await resolveApiKey(this.ctx, provider.credentialRef);
            const existing = this.engineSuite.agents.list().find(candidate => String(candidate.session.id) === request.sessionId);
            const handle = existing === undefined
                ? await this.engineSuite.agents.createExternal({
                    sessionId: request.sessionId,
                    selection,
                    apiKey,
                    cwd: request.cwd || this.ctx.get('sessions')?.get(SessionId(request.sessionId))?.header.cwd || process.cwd(),
                })
                : (await existing.updateSelection(selection, apiKey), existing);
            return {
                sessionId: String(handle.session.id),
                agentId: String(handle.agent.id),
                profileId: handle.profileId,
            };
        }
        async switchAgent(request) {
            const selection = {
                engineId: request.selection.engineId,
                providerId: request.selection.providerId,
                modelRecordId: request.selection.modelRecordId,
                ...request.selection.reasoningEffort === undefined
                    ? {}
                    : { reasoningEffort: request.selection.reasoningEffort },
            };
            const profile = this.engineSuite.resolveProfile(selection);
            const provider = this.engineSuite.providers.get(profile.providerId);
            const apiKey = await resolveApiKey(this.ctx, provider.credentialRef);
            const handle = await this.engineSuite.agents.switchExternal(request.sessionId, selection, apiKey);
            return {
                sessionId: String(handle.session.id),
                agentId: String(handle.agent.id),
                profileId: handle.profileId,
            };
        }
        async sessionCommands(sessionId, refresh) {
            const commands = await this.engineSuite.agents.listCommands(sessionId, refresh);
            return { sessionId, commands: commands.map(command => ({
                    name: command.name,
                    description: command.description,
                    argumentHint: command.argumentHint,
                    source: command.source,
                })) };
        }
        async discoverModels(providerId) {
            const provider = this.engineSuite.providers.get(providerId);
            const models = provider.engineId === 'codex-cli'
                ? await this.engineSuite.discoverCodexModels(providerId, {
                    apiKey: await resolveApiKey(this.ctx, provider.credentialRef),
                    cwd: process.cwd(),
                })
                : provider.engineId === 'claude-cli'
                    ? await this.engineSuite.discoverClaudeModels(providerId, {
                        apiKey: await resolveApiKey(this.ctx, provider.credentialRef),
                        cwd: process.cwd(),
                    })
                    : this.engineSuite.models.list(providerId);
            return {
                models: models.map(model => ({
                    id: model.id,
                    engineId: model.engineId,
                    providerId: model.providerId,
                    modelId: model.modelId,
                    ...model.displayName === undefined ? {} : { displayName: model.displayName },
                    ...model.description === undefined ? {} : { description: model.description },
                    enabled: model.enabled,
                    hidden: model.hidden,
                    reasoningOptions: model.reasoningOptions.map(option => ({
                        id: option.id,
                        ...option.description === undefined ? {} : { description: option.description },
                    })),
                    ...model.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
                    inputModalities: [...model.inputModalities],
                    ...model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens },
                    contextWindowSource: model.contextWindowSource,
                    source: model.source,
                })),
            };
        }
        async cancelAgent(agentId) {
            const handle = this.engineSuite.agents.list().find(candidate => String(candidate.agent.id) === agentId);
            if (handle === undefined)
                throw new Error(`unknown engine-suite agent: ${agentId}`);
            handle.agent.cancel({ kind: 'user' });
        }
    };
})();
export { EngineSuiteGateway };
//# sourceMappingURL=remote.js.map