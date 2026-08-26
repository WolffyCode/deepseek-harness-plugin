import { EngineAssetRegistry } from './assets.js';
import { discoverCodexModels } from './codex/discovery.js';
import { openCodexLaunch } from './codex/launch.js';
import { createClaudeProviderSession } from './claude/adapter.js';
import { ClaudeAssetMaterializationError, materializeClaudeMcpOptions, } from './claude/mcp.js';
import { materializeClaudeSkills } from './claude/skills.js';
import { assertClaudeModelAllowed, isOpusModel } from './claude/session.js';
import { createClaudeArchiveStore, getClaudeSessionHistory, importClaudeSessionToStore, listClaudeSessionDescriptors, normalizeClaudePersistenceHandle, realClaudeSdkGateway, } from './claude/persistence.js';
import { ClaudeSessionRuntimeBridge } from './agent/runtime.js';
import { EngineRegistry, ModelCatalog, ProviderRegistry } from './registry.js';
import { resolveEngineProfile } from './profile/resolver.js';
import { EngineProfileCatalog } from './profile/catalog.js';
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
export const CLAUDE_ENGINE = {
    id: 'claude-cli',
    type: 'claude-cli',
    displayName: 'Claude CLI',
    capabilities: {
        streaming: true,
        sessionResume: true,
        modelDiscovery: false,
        reasoningDiscovery: true,
        approvals: true,
        mcp: true,
        skills: true,
        backgroundAgent: false,
        steer: false,
        fork: false,
    },
};
function claudeModelDescriptor(model) {
    return {
        value: model.modelId,
        displayName: model.displayName,
        resolvedModel: model.id,
    };
}
function isClaudeOpusModel(model) {
    return model.engineId === 'claude-cli' && isOpusModel(claudeModelDescriptor(model));
}
class ClaudePolicyModelCatalog extends ModelCatalog {
    blockedModelRecordIds = new Set();
    register(input) {
        if (isClaudeOpusModel(input))
            assertClaudeModelAllowed(claudeModelDescriptor(input));
        this.blockedModelRecordIds.delete(input.id);
        return super.register(input);
    }
    replaceAll(inputs) {
        this.blockedModelRecordIds = new Set(inputs.filter(isClaudeOpusModel).map(model => model.id));
        super.replaceAll(inputs.filter(model => !isClaudeOpusModel(model)));
    }
    replaceProvider(providerId, models) {
        for (const model of models)
            this.blockedModelRecordIds.delete(model.id);
        const allowed = models.filter(model => {
            if (!isClaudeOpusModel(model))
                return true;
            this.blockedModelRecordIds.add(model.id);
            return false;
        });
        super.replaceProvider(providerId, allowed);
    }
    assertSelectionAllowed(selection) {
        if (selection.engineId !== 'claude-cli')
            return;
        if (this.blockedModelRecordIds.has(selection.modelRecordId) || isOpusModel(selection.modelRecordId)) {
            assertClaudeModelAllowed(selection.modelRecordId);
        }
    }
}
function profileResolverOptions(definition) {
    if (definition === undefined)
        return {};
    return {
        id: definition.id,
        ...definition.name === undefined ? {} : { name: definition.name },
        ...definition.revision === undefined ? {} : { revision: definition.revision },
        ...definition.allowedChildProfiles === undefined ? {} : { allowedChildProfiles: definition.allowedChildProfiles },
        ...definition.maxChildDepth === undefined ? {} : { maxChildDepth: definition.maxChildDepth },
        ...definition.maxConcurrentChildren === undefined ? {} : { maxConcurrentChildren: definition.maxConcurrentChildren },
        ...definition.skillSetRef === undefined ? {} : { skillSetRef: definition.skillSetRef },
        ...definition.mcpSetRef === undefined ? {} : { mcpSetRef: definition.mcpSetRef },
    };
}
function canonicalMcpSet(input) {
    return {
        scope: 'user',
        servers: input.servers.map(server => {
            if (server.transport === 'stdio') {
                if (server.command === undefined)
                    throw new Error(`stdio MCP server ${server.id} requires a command`);
                return {
                    name: server.name,
                    transport: 'stdio',
                    command: server.command,
                    ...(server.args === undefined ? {} : { args: [...server.args] }),
                    ...(server.environment === undefined ? {} : { env: { ...server.environment } }),
                    ...(server.credentialRefs === undefined ? {} : { credentialRefs: { ...server.credentialRefs } }),
                };
            }
            if (server.url === undefined)
                throw new Error(`${server.transport.toUpperCase()} MCP server ${server.id} requires a URL`);
            return {
                name: server.name,
                transport: server.transport,
                url: server.url,
                ...(server.headers === undefined ? {} : { headers: { ...server.headers } }),
                ...(server.credentialRefs === undefined ? {} : { credentialRefs: { ...server.credentialRefs } }),
            };
        }),
    };
}
function mergeMcpSets(userSet, internalSet) {
    if (userSet === undefined && internalSet === undefined)
        return undefined;
    const servers = [...userSet?.servers ?? [], ...internalSet?.servers ?? []];
    const ids = new Set();
    for (const server of servers) {
        if (ids.has(server.id))
            throw new Error(`MCP server id is duplicated across user and internal assets: ${server.id}`);
        ids.add(server.id);
    }
    return { id: userSet?.id ?? internalSet?.id ?? 'engine-suite-runtime', servers };
}
function materializeInternalMcpServers(input) {
    if (input === undefined)
        return {};
    const result = {};
    for (const server of input.servers) {
        if (server.credentialRefs !== undefined && Object.keys(server.credentialRefs).length > 0) {
            throw new Error(`internal MCP server ${server.id} cannot carry credential references`);
        }
        if (result[server.name] !== undefined)
            throw new Error(`internal MCP server name is duplicated: ${server.name}`);
        if (server.transport === 'stdio') {
            if (server.command === undefined)
                throw new Error(`stdio MCP server ${server.id} requires a command`);
            result[server.name] = {
                type: 'stdio',
                command: server.command,
                ...(server.args === undefined ? {} : { args: [...server.args] }),
                ...(server.environment === undefined ? {} : { env: { ...server.environment } }),
            };
        }
        else {
            if (server.url === undefined)
                throw new Error(`${server.transport.toUpperCase()} MCP server ${server.id} requires a URL`);
            result[server.name] = {
                type: server.transport,
                url: server.url,
                ...(server.headers === undefined ? {} : { headers: { ...server.headers } }),
            };
        }
    }
    return result;
}
function mergeClaudeMcpServers(userServers, internalServers) {
    if (userServers === undefined && Object.keys(internalServers).length === 0)
        return undefined;
    const result = { ...userServers };
    for (const [name, server] of Object.entries(internalServers)) {
        if (result[name] !== undefined)
            throw new Error(`internal MCP server conflicts with user MCP server: ${name}`);
        result[name] = server;
    }
    return result;
}
function credentialReferencePaths(input) {
    const paths = new Map();
    input.servers.forEach((server, index) => {
        for (const [target, reference] of Object.entries(server.credentialRefs ?? {})) {
            if (!paths.has(reference))
                paths.set(reference, `mcpServers[${index}].credentialRefs.${target}`);
        }
    });
    return paths;
}
async function materializerCredentialResolver(input, resolver) {
    const paths = credentialReferencePaths(input);
    if (paths.size === 0 || resolver === undefined)
        return undefined;
    const resolved = new Map();
    await Promise.all([...paths.entries()].map(async ([reference, path]) => {
        let value;
        try {
            value = await resolver(reference);
        }
        catch {
            throw new ClaudeAssetMaterializationError('MCP_CREDENTIAL_RESOLUTION_FAILED', path, 'credential resolution failed');
        }
        resolved.set(reference, value);
    }));
    return { resolve: reference => resolved.get(reference) };
}
async function materializeClaudeAssets(mcpSet, skillSet, resolver, mcpMaterializer, skillMaterializer) {
    const canonicalMcp = mcpSet === undefined ? undefined : canonicalMcpSet(mcpSet);
    const credentialResolver = canonicalMcp === undefined
        ? undefined
        : await materializerCredentialResolver(canonicalMcp, resolver);
    const mcpOptions = canonicalMcp === undefined
        ? {}
        : mcpMaterializer(canonicalMcp, credentialResolver === undefined ? {} : { credentialResolver });
    const skillOptions = skillSet === undefined
        ? {}
        : skillMaterializer({
            scope: 'user',
            pluginDirs: [...skillSet.pluginDirs],
            additionalDirectories: [...skillSet.additionalDirectories],
        });
    return {
        ...mcpOptions,
        ...(skillOptions.plugins === undefined ? {} : { skillPlugins: skillOptions.plugins.map(plugin => plugin.path) }),
        ...(skillOptions.additionalDirectories === undefined ? {} : { additionalDirectories: skillOptions.additionalDirectories }),
    };
}
export function createEngineSuiteRuntime(options = {}) {
    const claudeSessionFactory = options.claudeSessionFactory ?? createClaudeProviderSession;
    const credentialResolver = options.credentialResolver;
    const claudeMcpMaterializer = options.claudeMcpMaterializer ?? materializeClaudeMcpOptions;
    const claudeSkillMaterializer = options.claudeSkillMaterializer ?? materializeClaudeSkills;
    const configuredClaudeSdkGateway = options.claudeSdkGateway;
    const claudeSdkGateway = configuredClaudeSdkGateway ?? realClaudeSdkGateway;
    const claudeArchiveStore = options.claudeArchiveStore ?? createClaudeArchiveStore();
    const engines = new EngineRegistry();
    engines.register(CODEX_ENGINE);
    engines.register(CLAUDE_ENGINE);
    const providers = new ProviderRegistry();
    const models = new ClaudePolicyModelCatalog();
    const profiles = new EngineProfileCatalog();
    const assets = new EngineAssetRegistry();
    const resolveProfile = (selection) => {
        models.assertSelectionAllowed(selection);
        return resolveEngineProfile({ engines, providers, models }, selection, profileResolverOptions(profiles.find(selection)));
    };
    const runtime = {
        engines,
        providers,
        models,
        profiles,
        assets,
        claudeArchiveStore,
        resolveProfile,
        listClaudeSessions: async (input = {}) => listClaudeSessionDescriptors(claudeSdkGateway, input),
        getClaudeSessionHistory: (handle, input = {}) => getClaudeSessionHistory(claudeSdkGateway, handle, input),
        importClaudeSession: input => importClaudeSessionToStore(claudeSdkGateway, input),
        archiveClaudeSession: (handle, archivedAt) => {
            const valid = normalizeClaudePersistenceHandle(handle);
            claudeArchiveStore.remember(valid);
            return archivedAt === undefined ? claudeArchiveStore.archive(valid) : claudeArchiveStore.archive(valid, archivedAt);
        },
        unarchiveClaudeSession: handle => claudeArchiveStore.unarchive(normalizeClaudePersistenceHandle(handle)),
        resumeClaudeSession: async (selection, input) => {
            const handle = normalizeClaudePersistenceHandle(input.handle);
            const { handle: _handle, cwd: requestedCwd, ...openOptions } = input;
            return runtime.openEngine(selection, {
                ...openOptions,
                cwd: requestedCwd ?? handle.cwd,
                ...(handle.runtimeRoot === undefined || openOptions.runtimeRoot !== undefined ? {} : { runtimeRoot: handle.runtimeRoot }),
                resumeThreadId: handle.nativeHandle,
            });
        },
        reconnectClaudeSession: async (selection, input) => {
            const handle = normalizeClaudePersistenceHandle(input.handle);
            const { handle: _handle, cwd: requestedCwd, ...openOptions } = input;
            return runtime.openEngine(selection, {
                ...openOptions,
                cwd: requestedCwd ?? handle.cwd,
                ...(handle.runtimeRoot === undefined || openOptions.runtimeRoot !== undefined ? {} : { runtimeRoot: handle.runtimeRoot }),
                resumeThreadId: handle.nativeHandle,
            });
        },
        discoverCodexModels: async (providerId, options) => {
            const provider = providers.get(providerId);
            const discovered = await discoverCodexModels({ ...options, provider });
            models.replaceProvider(providerId, discovered);
            return discovered;
        },
        openCodex: async (selection, options) => {
            const profile = resolveProfile(selection);
            const mcpSet = options.mcpSet ?? (profile.mcpSetRef === undefined ? undefined : assets.mcpSet(profile.mcpSetRef));
            const skillSet = options.skillSet ?? (profile.skillSetRef === undefined ? undefined : assets.skillSet(profile.skillSetRef));
            return openCodexLaunch({
                ...options,
                profile,
                provider: providers.get(profile.providerId),
                model: models.get(profile.modelRecordId),
                ...mcpSet === undefined ? {} : { mcpSet },
                ...skillSet === undefined ? {} : { skillSet },
            });
        },
        openEngine: async (selection, options) => {
            const profile = resolveProfile(selection);
            const provider = providers.get(profile.providerId);
            const model = models.get(profile.modelRecordId);
            const mcpSet = options.mcpSet ?? (profile.mcpSetRef === undefined ? undefined : assets.mcpSet(profile.mcpSetRef));
            const skillSet = options.skillSet ?? (profile.skillSetRef === undefined ? undefined : assets.skillSet(profile.skillSetRef));
            if (profile.engineId === 'codex-cli') {
                const { mcpSet: _mcpSet, skillSet: _skillSet, ...codexOptions } = options;
                const launch = await openCodexLaunch({
                    ...codexOptions,
                    profile,
                    provider,
                    model,
                    ...mcpSet === undefined ? {} : { mcpSet },
                    ...skillSet === undefined ? {} : { skillSet },
                });
                return {
                    runtime: launch.runtime,
                    profile: launch.profile,
                    runtimeRoot: launch.runtimeRoot,
                    nativeSessionId: launch.runtime.threadId ?? '',
                    close: launch.close,
                };
            }
            if (profile.engineId === 'claude-cli') {
                assertClaudeModelAllowed(model.modelId);
                const permissionModes = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'];
                const permissionMode = permissionModes.includes(options.permissionPreset)
                    ? options.permissionPreset
                    : 'default';
                const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(profile.reasoningEffort ?? '')
                    ? profile.reasoningEffort
                    : undefined;
                const assetOptions = await materializeClaudeAssets(mcpSet, skillSet, options.credentialResolver ?? credentialResolver, claudeMcpMaterializer, claudeSkillMaterializer);
                const claudeOptions = {
                    cwd: options.cwd,
                    model: model.modelId,
                    ...(effort === undefined ? {} : { effort }),
                    permissionMode,
                    ...(provider.baseUri === undefined ? {} : { baseUri: provider.baseUri }),
                    ...(options.apiKey === undefined ? {} : { authToken: options.apiKey }),
                    ...(options.executable === undefined ? {} : { executablePath: options.executable }),
                    ...(options.args === undefined ? {} : { commandArgs: options.args }),
                    ...(options.environment === undefined ? {} : { environment: options.environment }),
                    ...(options.resumeThreadId === undefined ? {} : { resumeSessionId: options.resumeThreadId }),
                    ...assetOptions,
                    ...(options.sessionStore === undefined ? {} : { sessionStore: options.sessionStore }),
                    ...(options.sessionStoreFlush === undefined ? {} : { sessionStoreFlush: options.sessionStoreFlush }),
                    ...(configuredClaudeSdkGateway === undefined ? {} : { persistenceGateway: claudeSdkGateway }),
                    persistSession: true,
                };
                const session = claudeSessionFactory(claudeOptions);
                const runtime = new ClaudeSessionRuntimeBridge(session);
                try {
                    await runtime.whenReady();
                    const nativeSessionId = session.sessionId ?? session.persistenceHandle()?.nativeHandle;
                    if (nativeSessionId === undefined || nativeSessionId.length === 0) {
                        throw new Error('Claude session initialized without a native session id');
                    }
                    return {
                        runtime,
                        profile,
                        runtimeRoot: options.runtimeRoot ?? '',
                        nativeSessionId,
                        close: () => runtime.close(),
                    };
                }
                catch (error) {
                    await runtime.close().catch(() => undefined);
                    throw error;
                }
            }
            throw new Error(`unsupported Engine Suite engine: ${profile.engineId}`);
        },
    };
    return runtime;
}
export function createEngineSuite() {
    return createEngineSuiteRuntime();
}
//# sourceMappingURL=engine-suite.js.map