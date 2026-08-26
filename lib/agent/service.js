import { agentEvents, } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { EngineSuiteChildBridge } from '../orchestration/bridge.js';
import { ExternalEngineBindingStore } from '../engine/bindings.js';
import { ExternalEngineAgent } from './external-engine-agent.js';
import { latestWorkspacePermission } from '../permission.js';
import { createCodexServerRequestHandler } from '../codex/requests.js';
import { createParentChildLineageStore, } from '../orchestration/lineage.js';
function sessionHasConversation(session) {
    return session.events.some(event => event.type === 'turn/start' || event.type === 'user/message');
}
function sameSelection(a, b) {
    return a.engineId === b.engineId
        && a.providerId === b.providerId
        && a.modelRecordId === b.modelRecordId
        && a.reasoningEffort === b.reasoningEffort;
}
function assistantText(session) {
    const parts = [];
    for (let index = session.events.length - 1; index >= 0; index--) {
        const event = session.events[index];
        if (event?.type !== 'assistant/message')
            continue;
        for (const block of event.data.message.content) {
            if (block.type === 'text')
                parts.unshift(block.text);
        }
        if (parts.length > 0)
            return parts.join('\n').trim();
    }
    return '';
}
function commandCatalogRuntime(runtime) {
    return runtime;
}
function jsonObject(value, label) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function commandString(value, fallback) {
    return typeof value === 'string' ? value : fallback;
}
function commandSource(value) {
    return value === 'skill' ? 'skill' : 'command';
}
function normalizeCommand(command, skills) {
    return {
        name: command.name,
        description: command.description ?? '',
        argumentHint: command.argumentHint ?? '',
        source: commandSource(command.source) === 'skill' || skills.has(command.name) ? 'skill' : 'command',
    };
}
async function codexCommands(runtime, cwd) {
    if (runtime.transport === undefined || runtime.threadId === undefined)
        throw new Error('Codex command catalog is unavailable');
    const response = await runtime.transport.request('skills/list', { cwds: [cwd] });
    const root = jsonObject(response, 'skills/list response');
    const entries = root['data'];
    if (!Array.isArray(entries))
        throw new Error('skills/list response.data must be an array');
    const commands = new Map();
    commands.set('compact', { name: 'compact', description: 'Summarize conversation to prevent hitting the context limit', argumentHint: '', source: 'command' });
    for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
            continue;
        const skills = entry['skills'];
        if (!Array.isArray(skills))
            continue;
        for (const skill of skills) {
            if (typeof skill !== 'object' || skill === null || Array.isArray(skill))
                continue;
            const name = commandString(skill['name'], '');
            const path = commandString(skill['path'], '');
            if (name.length === 0 || path.length === 0 || skill['enabled'] === false)
                continue;
            commands.set(name, {
                name,
                description: commandString(skill['description'], ''),
                argumentHint: '',
                source: 'skill',
            });
        }
    }
    return [...commands.values()].sort((a, b) => a.name.localeCompare(b.name));
}
async function runtimeCommands(runtime, cwd, refresh) {
    const catalogRuntime = commandCatalogRuntime(runtime);
    if (catalogRuntime.session !== undefined) {
        const catalog = refresh ? await catalogRuntime.session.refreshCatalog() : { commands: catalogRuntime.session.listCommands() };
        const skills = new Set((catalog.skills ?? catalogRuntime.session.catalog.skills).map(skill => skill.name));
        return catalog.commands.map(command => normalizeCommand(command, skills));
    }
    return codexCommands(catalogRuntime, cwd);
}
function turnFailure(session) {
    const last = [...session.events].reverse().find(event => event.type === 'turn/end');
    if (last === undefined || last.type !== 'turn/end')
        return 'child agent did not finish a turn';
    if (last.data.reason.kind === 'completed')
        return undefined;
    if (last.data.reason.kind === 'error')
        return last.data.reason.error.message;
    return `child agent turn ended with ${last.data.reason.kind}`;
}
/**
 * Creates and registers external Engine Agents without replacing Harness core
 * services. The optional primary factory is used only when this plugin is
 * explicitly configured as the AgentFactory owner.
 */
export class EngineSuiteAgentService {
    ctx;
    suite;
    resolveApiKey;
    catalogReady;
    live = new Set();
    children = new Map();
    bindings;
    childBridge;
    childBridgeReady;
    lineageStore;
    closedSessions = new Map();
    closedProcessOptions = new Map();
    constructor(ctx, suite, resolveApiKey, catalogReady = Promise.resolve(), bindings = new ExternalEngineBindingStore(), lineageStore = createParentChildLineageStore()) {
        this.ctx = ctx;
        this.suite = suite;
        this.resolveApiKey = resolveApiKey;
        this.catalogReady = catalogReady;
        this.bindings = bindings;
        this.lineageStore = lineageStore;
        this.childBridge = new EngineSuiteChildBridge(request => this.delegateFromBridge(request));
        this.childBridgeReady = this.childBridge.start();
        ctx.effect(() => async () => {
            const handles = [...this.live];
            await Promise.all(handles.map(handle => handle.dispose()));
            this.live.clear();
            await this.childBridge.close();
        }, 'engine-suite.agents');
    }
    async createExternal(options) {
        return this.createExternalOn(this.ctx, options);
    }
    async createCodex(options) {
        return this.createExternalOn(this.ctx, { ...options, engineId: 'codex-cli' });
    }
    async switchExternal(sessionId, selection, apiKey) {
        const handle = [...this.live].find(candidate => String(candidate.session.id) === sessionId);
        if (handle === undefined)
            throw new Error(`unknown Engine Suite session: ${sessionId}`);
        await handle.updateSelection(selection, apiKey, latestWorkspacePermission(handle.session));
        return handle;
    }
    async listCommands(sessionId, refresh = true) {
        const handle = [...this.live].find(candidate => String(candidate.session.id) === sessionId);
        if (handle === undefined)
            throw new Error(`unknown Engine Suite session: ${sessionId}`);
        if (handle.selection.engineId !== 'claude-cli' && handle.selection.engineId !== 'codex-cli') {
            throw new Error(`slash commands are unavailable for engine ${handle.selection.engineId}`);
        }
        return handle.listCommands(refresh);
    }
    /** Create a child Engine Agent from an authorized parent profile. */
    async delegate(parentSessionId, request) {
        const parent = [...this.live].find(candidate => String(candidate.session.id) === parentSessionId);
        if (parent === undefined)
            throw new Error(`unknown parent Engine Suite session: ${parentSessionId}`);
        const parentProfile = this.suite.resolveProfile(parent.selection);
        if (!parentProfile.allowedChildProfiles.includes(request.profileId)) {
            throw new Error(`profile ${parent.profileId} is not allowed to delegate to child profile ${request.profileId}`);
        }
        const childDefinition = this.suite.profiles.get(request.profileId);
        const depth = parent.delegationDepth + 1;
        if (depth > parentProfile.maxChildDepth)
            throw new Error(`child delegation depth ${depth} exceeds profile limit ${parentProfile.maxChildDepth}`);
        const currentChildren = this.children.get(parentSessionId) ?? new Set();
        if (currentChildren.size >= parentProfile.maxConcurrentChildren) {
            throw new Error(`profile ${parent.profileId} reached its child concurrency limit of ${parentProfile.maxConcurrentChildren}`);
        }
        if (request.task.trim().length === 0)
            throw new Error('child task must not be empty');
        const childSessionId = SessionId(crypto.randomUUID());
        const nativeTaskId = request.nativeTaskId?.trim() || `engine-suite-task-${crypto.randomUUID()}`;
        const lineage = this.lineageStore.create({
            parentSessionId,
            nativeTaskId,
            childSessionId: String(childSessionId),
            depth,
            profile: request.profileId,
            status: 'running',
        });
        if (childDefinition.selection.engineId === 'deepseek-native') {
            return this.delegateNative(parent, request, childDefinition.selection, depth, currentChildren, lineage);
        }
        const ownerCtx = parent.agent.ctx;
        const sessions = ownerCtx.get('sessions');
        if (sessions === undefined)
            throw new Error('Engine Suite requires Harness SessionStore for child delegation');
        const childSession = sessions.prepare(childSessionId, {
            meta: {
                cwd: parent.session.header.cwd ?? process.cwd(),
                parentSession: SessionId(parentSessionId),
                origin: 'subagent',
                delegationDepth: depth,
                agentPreset: request.profileId,
            },
        });
        const provider = this.suite.providers.get(childDefinition.selection.providerId);
        let child;
        try {
            child = await this.createExternalOn(ownerCtx, {
                sessionId: String(childSessionId),
                selection: childDefinition.selection,
                apiKey: request.apiKey ?? await this.resolveApiKey(provider.credentialRef),
                cwd: parent.session.header.cwd ?? process.cwd(),
                ...request.executable === undefined ? {} : { executable: request.executable },
                ...request.args === undefined ? {} : { args: request.args },
                session: childSession,
                parentAgent: parent.agent,
                parentSessionId,
                delegationDepth: depth,
                engineId: childDefinition.selection.engineId,
                nativeTaskId,
            });
            currentChildren.add(child);
            this.children.set(parentSessionId, currentChildren);
            child.agent.followup(createUserMessage({ content: [{ type: 'text', text: request.task }], source: { kind: 'user' } }));
            await child.agent.whenIdle();
            const failure = turnFailure(child.session);
            if (failure !== undefined)
                throw new Error(failure);
            const text = assistantText(child.session);
            if (this.lineageStore.getByChildSessionId(String(child.session.id))?.status === 'running') {
                this.lineageStore.append({ parentSessionId, nativeTaskId, childSessionId: String(child.session.id), type: 'result', data: text });
            }
            return { handle: child, text, lineage: this.lineageStore.getByChildSessionId(String(child.session.id)) ?? lineage };
        }
        catch (error) {
            if (this.lineageStore.getByChildSessionId(String(childSessionId))?.status === 'running') {
                this.lineageStore.append({ parentSessionId, nativeTaskId, childSessionId: String(childSessionId), type: 'error', error: error instanceof Error ? error.message : String(error) });
            }
            if (child !== undefined)
                await child.dispose().catch(() => { });
            throw error;
        }
    }
    /** AgentRegistry factory entry used by session.create when Engine Suite is primary. */
    async createAgent(ownerCtx, options) {
        await this.catalogReady;
        const selection = this.defaultSelection(options.agentOptions);
        const provider = this.suite.providers.get(selection.providerId);
        const cwd = options.meta?.cwd ?? process.cwd();
        const parentAgent = ownerCtx.get('agent');
        return this.createExternalOn(ownerCtx, {
            sessionId: String(options.sessionId),
            selection,
            apiKey: await this.resolveApiKey(provider.credentialRef),
            cwd,
            ...options.meta?.parentSession === undefined ? {} : { parentSessionId: String(options.meta.parentSession) },
            ...options.meta?.delegationDepth === undefined ? {} : { delegationDepth: options.meta.delegationDepth },
            ...parentAgent === undefined ? {} : { parentAgent },
        });
    }
    /** Cold resume invoked by Harness API Remote lookup after a process restart. */
    async resume(ownerCtx, options) {
        const sessionId = SessionId(String(options.resumeSessionId));
        const id = String(sessionId);
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage?.status === 'archived')
            throw new Error(`cannot resume archived child session ${id}`);
        const binding = await this.bindings.get(id);
        if (binding === undefined)
            throw new Error(`External Engine native-session binding is missing for session ${id}`);
        const parent = lineage === undefined ? undefined : [...this.live].find(candidate => String(candidate.session.id) === lineage.parentSessionId);
        const persisted = this.closedSessions.get(id);
        const processOptions = this.closedProcessOptions.get(id);
        const persistence = ownerCtx.get('sessionPersistence');
        let session;
        let releasePreparation;
        if (persisted !== undefined) {
            session = persisted;
        }
        else {
            if (persistence === undefined)
                throw new Error('External Engine resume requires Harness SessionPersistence');
            const preparation = await persistence.prepare(sessionId);
            session = preparation.session;
            releasePreparation = () => preparation[Symbol.dispose]();
        }
        try {
            const hasConversation = sessionHasConversation(session);
            const selection = hasConversation ? binding.selection : this.defaultSelection(undefined);
            const provider = this.suite.providers.get(selection.providerId);
            const resumed = await this.createExternalOn(ownerCtx, {
                sessionId: id,
                selection,
                apiKey: await this.resolveApiKey(provider.credentialRef),
                cwd: session.header.cwd ?? process.cwd(),
                session,
                ...hasConversation ? {
                    runtimeRoot: binding.runtimeRoot,
                    preserveRuntimeRoot: true,
                    resumeThreadId: binding.nativeSessionId,
                    engineId: binding.engineId,
                    ...processOptions ?? {},
                } : {},
                ...parent === undefined || lineage === undefined ? {} : { parentAgent: parent.agent, parentSessionId: String(parent.session.id), delegationDepth: lineage.depth, nativeTaskId: lineage.nativeTaskId },
            });
            this.closedSessions.delete(id);
            if (lineage !== undefined && lineage.status !== 'detached')
                this.lineageStore.update(id, { status: 'running' });
            return resumed;
        }
        finally {
            releasePreparation?.();
        }
    }
    list() {
        return [...this.live];
    }
    listLineages(parentSessionId) {
        return this.lineageStore.list(parentSessionId);
    }
    subscribeLineage(parentSessionId, listener) {
        return this.lineageStore.subscribe(parentSessionId, listener);
    }
    replayLineage(parentSessionId, afterSequence) {
        return this.lineageStore.replay(parentSessionId, afterSequence);
    }
    async resumeChild(childSessionId) {
        const sessionId = SessionId(childSessionId);
        const id = String(sessionId);
        const live = [...this.live].find(candidate => String(candidate.session.id) === id);
        if (live !== undefined)
            return live;
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage === undefined)
            throw new Error(`unknown child Engine Suite session: ${id}`);
        const parent = [...this.live].find(candidate => String(candidate.session.id) === lineage.parentSessionId);
        const ownerCtx = parent?.agent.ctx ?? this.ctx;
        return this.resume(ownerCtx, { resumeSessionId: sessionId });
    }
    async archiveChild(childSessionId) {
        const id = String(SessionId(childSessionId));
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage === undefined)
            throw new Error(`unknown child Engine Suite session: ${id}`);
        const handle = [...this.live].find(candidate => String(candidate.session.id) === id);
        if (handle !== undefined && handle.selection.engineId === 'claude-cli') {
            const binding = await this.bindings.get(id);
            if (binding !== undefined) {
                this.suite.archiveClaudeSession({ provider: 'claude-cli', sessionId: id, nativeHandle: binding.nativeSessionId, cwd: handle.session.header.cwd ?? process.cwd(), runtimeRoot: binding.runtimeRoot });
            }
        }
        if (handle !== undefined)
            await handle.dispose();
        this.closedSessions.delete(id);
        this.closedProcessOptions.delete(id);
        return this.lineageStore.update(id, { status: 'archived' });
    }
    async detachChild(childSessionId) {
        const id = String(SessionId(childSessionId));
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage === undefined)
            throw new Error(`unknown child Engine Suite session: ${id}`);
        const handle = [...this.live].find(candidate => String(candidate.session.id) === id);
        if (handle?.parentSessionId !== undefined) {
            const children = this.children.get(handle.parentSessionId);
            children?.delete(handle);
            if (children !== undefined && children.size === 0)
                this.children.delete(handle.parentSessionId);
        }
        return this.lineageStore.update(id, { status: 'detached' });
    }
    async cancelChild(childSessionId) {
        const id = String(SessionId(childSessionId));
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage === undefined)
            throw new Error(`unknown child Engine Suite session: ${id}`);
        const handle = [...this.live].find(candidate => String(candidate.session.id) === id);
        if (handle !== undefined) {
            handle.agent.cancel({ kind: 'user' });
            await handle.agent.whenIdle();
        }
        if (this.lineageStore.getByChildSessionId(id)?.status === 'running') {
            this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: id, type: 'cancel' });
        }
        return this.lineageStore.getByChildSessionId(id) ?? lineage;
    }
    async cancelChildren(parentSessionId) {
        const children = [...this.children.get(parentSessionId) ?? []]
            .filter(child => this.shouldDisposeWithParent(child));
        await Promise.all(children.map(child => this.cancelChild(String(child.session.id)).catch(() => undefined)));
    }
    shouldDisposeWithParent(child) {
        return this.lineageStore.getByChildSessionId(String(child.session.id))?.status !== 'detached';
    }
    async delegateNative(parent, request, selection, depth, currentChildren, lineage) {
        const agents = parent.agent.ctx.get('agents');
        if (agents === undefined)
            throw new Error('DeepSeek Native child delegation requires Harness AgentRegistry');
        const childSessionId = SessionId(lineage.childSessionId);
        const nativeHandle = await agents.create({
            sessionId: childSessionId,
            meta: {
                cwd: parent.session.header.cwd ?? process.cwd(),
                parentSession: SessionId(String(parent.session.id)),
                origin: 'subagent',
                delegationDepth: depth,
                agentPreset: request.profileId,
            },
            agentOptions: { provider: selection.providerId, model: selection.modelRecordId },
        });
        let disposePromise;
        const handle = {
            agent: nativeHandle.agent,
            session: nativeHandle.agent.session,
            parentSessionId: String(parent.session.id),
            delegationDepth: depth,
            nativeTaskId: lineage.nativeTaskId,
            profileId: request.profileId,
            selection,
            listCommands: async () => { throw new Error('slash commands are unavailable for DeepSeek Native sessions'); },
            updateSelection: async () => { throw new Error('DeepSeek Native child selection is immutable during delegation'); },
            dispose: () => {
                if (disposePromise !== undefined)
                    return disposePromise;
                disposePromise = (async () => {
                    this.closedSessions.set(String(handle.session.id), handle.session);
                    this.live.delete(handle);
                    currentChildren.delete(handle);
                    await nativeHandle.dispose();
                })();
                return disposePromise;
            },
        };
        this.live.add(handle);
        currentChildren.add(handle);
        this.children.set(String(parent.session.id), currentChildren);
        nativeHandle.agent.followup(createUserMessage({ content: [{ type: 'text', text: request.task }], source: { kind: 'user' } }));
        await nativeHandle.agent.whenIdle();
        const failure = turnFailure(nativeHandle.agent.session);
        if (failure !== undefined)
            throw new Error(failure);
        const text = assistantText(nativeHandle.agent.session);
        if (this.lineageStore.getByChildSessionId(lineage.childSessionId)?.status === 'running')
            this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'result', data: text });
        return { handle, text, lineage: this.lineageStore.getByChildSessionId(lineage.childSessionId) ?? lineage };
    }
    async delegateFromBridge(request) {
        const result = await this.delegate(request.parentSessionId, { profileId: request.profileId, task: request.task, ...request.nativeTaskId === undefined ? {} : { nativeTaskId: request.nativeTaskId } });
        return { childSessionId: String(result.handle.session.id), text: result.text, nativeTaskId: result.lineage.nativeTaskId };
    }
    defaultSelection(agentOptions) {
        const requestedProvider = agentOptions?.provider;
        const requestedModel = agentOptions?.model;
        const providers = this.suite.providers.list().filter(candidate => candidate.enabled);
        const provider = providers.find(candidate => candidate.id === requestedProvider)
            ?? providers.find(candidate => candidate.engineId === 'codex-cli')
            ?? providers[0];
        if (provider === undefined) {
            throw new Error(`Engine Suite has no enabled Provider for AgentFactory creation (available: ${this.suite.providers.list().map(candidate => `${candidate.id}:${String(candidate.enabled)}`).join(', ') || 'none'})`);
        }
        const models = this.suite.models.list(provider.id).filter(candidate => candidate.enabled && !candidate.hidden);
        const model = models.find(candidate => candidate.modelId === requestedModel) ?? models[0];
        if (model === undefined) {
            throw new Error(`Engine Suite has no enabled Model for provider ${provider.id}`);
        }
        return {
            engineId: provider.engineId,
            providerId: provider.id,
            modelRecordId: model.id,
            ...model.defaultReasoningEffort === undefined
                ? {}
                : { reasoningEffort: model.defaultReasoningEffort },
        };
    }
    async createExternalOn(ownerCtx, options) {
        const id = SessionId(options.sessionId);
        const profile = this.suite.resolveProfile(options.selection);
        const provider = this.suite.providers.get(profile.providerId);
        const model = this.suite.models.get(profile.modelRecordId);
        const sessions = ownerCtx.get('sessions');
        const agents = ownerCtx.get('agents');
        if (sessions === undefined || agents === undefined) {
            throw new Error('Engine Suite requires Harness SessionStore and AgentRegistry');
        }
        const existingSession = sessions.get(id);
        if (options.session === undefined && existingSession !== undefined && sessionHasConversation(existingSession)) {
            throw new Error(`cannot attach an external Engine to a non-empty Session: ${String(id)}`);
        }
        const session = options.session ?? existingSession ?? sessions.prepare(id, { meta: { cwd: options.cwd || process.cwd() } });
        const ownsSession = sessions.get(id) !== session;
        const runtimeRoot = options.runtimeRoot ?? this.bindings.runtimeRoot(String(id));
        const permissionPreset = latestWorkspacePermission(session);
        let agent;
        const approval = ownerCtx.get('approval');
        const serverRequestHandler = createCodexServerRequestHandler({ agent: () => agent, ...approval === undefined ? {} : { approval } });
        const bridge = profile.allowedChildProfiles.length === 0
            ? undefined
            : await this.childBridgeReady.then(() => this.childBridge.launchFor(String(id)));
        const launch = await this.suite.openEngine(options.selection, {
            apiKey: options.apiKey,
            cwd: options.cwd,
            runtimeRoot,
            preserveRuntimeRoot: options.preserveRuntimeRoot ?? true,
            ...options.resumeThreadId === undefined ? {} : { resumeThreadId: options.resumeThreadId },
            ...options.executable === undefined ? {} : { executable: options.executable },
            ...options.args === undefined ? {} : { args: options.args },
            ...permissionPreset === undefined ? {} : { permissionPreset },
            serverRequestHandler,
            ...bridge === undefined ? {} : { internalMcpSet: { id: 'engine-suite-child-bridge', servers: [{ ...bridge.mcpServer, args: [...bridge.mcpServer.args] }] }, environment: bridge.environment },
        });
        let detachSession;
        let detachAgent;
        try {
            const existingHeader = session.requestHeader();
            if (existingHeader === undefined || !sessionHasConversation(session)) {
                const config = { provider: provider.id, model: model.modelId };
                if (profile.reasoningEffort !== undefined) {
                    config.reasoningEffort = profile.reasoningEffort;
                }
                session.append('request/header', {
                    header: { config },
                    reason: existingHeader === undefined ? 'initial' : 'change',
                });
            }
            const agentOptions = {
                provider: provider.id,
                model: model.modelId,
            };
            agent = new ExternalEngineAgent(ownerCtx, id, agentOptions, session, launch.runtime, provider.id, model.modelId);
            if (ownsSession) {
                detachSession = sessions.enter(session);
                sessions.announce(session);
            }
            detachAgent = agents.enter(agent, options.parentAgent ?? ownerCtx.get('agent'));
            agents.announce(agent);
            agentEvents(ownerCtx, agent).emit('agent/session-start', { source: options.resumeThreadId === undefined ? 'startup' : 'resume' });
            if (launch.nativeSessionId === '')
                throw new Error(`External engine did not publish a native session id for ${String(id)}`);
            await this.bindings.put({
                sessionId: String(id),
                engineId: options.engineId ?? profile.engineId,
                nativeSessionId: launch.nativeSessionId,
                runtimeRoot,
                selection: options.selection,
            });
            let activeLaunch = launch;
            let activeApiKey = options.apiKey;
            let commandCatalog;
            let commandOperation;
            let commandClosed = false;
            let disposePromise;
            const handle = {
                agent,
                session,
                ...options.parentSessionId === undefined ? {} : { parentSessionId: options.parentSessionId },
                delegationDepth: options.delegationDepth ?? session.header.delegationDepth ?? 0,
                profileId: profile.id,
                selection: options.selection,
                listCommands: async (refresh = true) => {
                    if (commandClosed)
                        throw new Error(`Engine Suite session is closed: ${String(id)}`);
                    if (!refresh && commandCatalog !== undefined)
                        return commandCatalog;
                    if (commandOperation !== undefined)
                        return commandOperation;
                    commandOperation = runtimeCommands(activeLaunch.runtime, session.header.cwd ?? options.cwd, refresh)
                        .then(commands => {
                        if (commandClosed)
                            throw new Error(`Engine Suite session is closed: ${String(id)}`);
                        commandCatalog = Object.freeze(commands.map(command => Object.freeze({ ...command })));
                        return commandCatalog;
                    })
                        .catch(error => {
                        commandCatalog = undefined;
                        throw error;
                    })
                        .finally(() => { commandOperation = undefined; });
                    return commandOperation;
                },
                updateSelection: async (nextSelection, nextApiKey, nextPermissionPreset) => {
                    if (sameSelection(handle.selection, nextSelection))
                        return;
                    const hasConversation = sessionHasConversation(session);
                    if (hasConversation && nextSelection.engineId !== handle.selection.engineId) {
                        throw new Error(`Engine selection is locked after the first turn: ${String(id)}`);
                    }
                    if (agent.status !== 'idle')
                        throw new Error(`Engine selection is locked while session ${String(id)} is busy`);
                    const previousLaunch = activeLaunch;
                    const previousSelection = handle.selection;
                    const previousApiKey = activeApiKey;
                    const nextProfile = this.suite.resolveProfile(nextSelection);
                    const nextProvider = this.suite.providers.get(nextProfile.providerId);
                    const nextModel = this.suite.models.get(nextProfile.modelRecordId);
                    const nextBridge = nextProfile.allowedChildProfiles.length === 0
                        ? undefined
                        : await this.childBridgeReady.then(() => this.childBridge.launchFor(String(id)));
                    const launchOptions = {
                        apiKey: nextApiKey,
                        cwd: session.header.cwd ?? options.cwd,
                        runtimeRoot: previousLaunch.runtimeRoot,
                        preserveRuntimeRoot: true,
                        ...hasConversation && previousLaunch.nativeSessionId !== ''
                            ? { resumeThreadId: previousLaunch.nativeSessionId }
                            : {},
                        ...options.executable === undefined ? {} : { executable: options.executable },
                        ...options.args === undefined ? {} : { args: options.args },
                        ...nextPermissionPreset === undefined ? {} : { permissionPreset: nextPermissionPreset },
                        serverRequestHandler,
                        ...nextBridge === undefined ? {} : { internalMcpSet: { id: 'engine-suite-child-bridge', servers: [{ ...nextBridge.mcpServer, args: [...nextBridge.mcpServer.args] }] }, environment: nextBridge.environment },
                    };
                    await previousLaunch.close();
                    let nextLaunch;
                    try {
                        nextLaunch = await this.suite.openEngine(nextSelection, launchOptions);
                        if (nextLaunch.nativeSessionId === '') {
                            await nextLaunch.close();
                            throw new Error(`External engine did not publish a native session id for ${String(id)}`);
                        }
                    }
                    catch (error) {
                        try {
                            const previousPermissionPreset = latestWorkspacePermission(session);
                            const restored = await this.suite.openEngine(previousSelection, {
                                apiKey: previousApiKey,
                                cwd: session.header.cwd ?? options.cwd,
                                runtimeRoot: previousLaunch.runtimeRoot,
                                preserveRuntimeRoot: true,
                                ...hasConversation && previousLaunch.nativeSessionId !== ''
                                    ? { resumeThreadId: previousLaunch.nativeSessionId }
                                    : {},
                                ...options.executable === undefined ? {} : { executable: options.executable },
                                ...options.args === undefined ? {} : { args: options.args },
                                ...previousPermissionPreset === undefined ? {} : { permissionPreset: previousPermissionPreset },
                                serverRequestHandler,
                            });
                            activeLaunch = restored;
                        }
                        catch {
                            // Keep the original failure; the next user action can recreate the runtime through resume.
                        }
                        throw error;
                    }
                    agent.replaceRuntime(nextLaunch.runtime, nextProvider.id, nextModel.modelId);
                    activeLaunch = nextLaunch;
                    activeApiKey = nextApiKey;
                    commandCatalog = undefined;
                    handle.profileId = nextProfile.id;
                    handle.selection = nextSelection;
                    const config = { provider: nextProvider.id, model: nextModel.modelId };
                    if (nextProfile.reasoningEffort !== undefined) {
                        config.reasoningEffort = nextProfile.reasoningEffort;
                    }
                    session.append('request/header', { header: { config }, reason: 'change' });
                    await this.bindings.put({
                        sessionId: String(id),
                        engineId: nextProfile.engineId,
                        nativeSessionId: nextLaunch.nativeSessionId,
                        runtimeRoot: nextLaunch.runtimeRoot,
                        selection: nextSelection,
                    });
                },
                dispose: () => {
                    if (disposePromise !== undefined)
                        return disposePromise;
                    disposePromise = (async () => {
                        const childHandles = [...this.children.get(String(id)) ?? []]
                            .filter(child => this.shouldDisposeWithParent(child));
                        await Promise.all(childHandles.map(child => child.dispose()));
                        this.children.delete(String(id));
                        this.closedSessions.set(String(id), session);
                        this.closedProcessOptions.set(String(id), {
                            ...options.executable === undefined ? {} : { executable: options.executable },
                            ...options.args === undefined ? {} : { args: [...options.args] },
                        });
                        this.live.delete(handle);
                        commandClosed = true;
                        commandCatalog = undefined;
                        commandOperation = undefined;
                        if (options.parentSessionId !== undefined) {
                            const siblings = this.children.get(options.parentSessionId);
                            siblings?.delete(handle);
                            if (siblings !== undefined && siblings.size === 0)
                                this.children.delete(options.parentSessionId);
                        }
                        await agent.dispose();
                        detachAgent?.();
                        detachSession?.();
                        await activeLaunch.close();
                    })();
                    return disposePromise;
                },
            };
            this.live.add(handle);
            ownerCtx.effect(() => () => {
                if (this.shouldDisposeWithParent(handle))
                    void handle.dispose();
            }, `engine-suite.agent(${String(id)})`);
            await this.attachWorkspace(ownerCtx, session.header.cwd ?? options.cwd, id);
            return handle;
        }
        catch (error) {
            await agent?.dispose().catch(() => { });
            detachAgent?.();
            detachSession?.();
            await launch.close();
            throw error;
        }
    }
    observeChildRuntimeEvent(lineage, event) {
        const current = this.lineageStore.getByChildSessionId(lineage.childSessionId);
        if (current === undefined || current.status !== 'running')
            return;
        if (event.type === 'timeline') {
            const data = event.item.type === 'assistant_message' || event.item.type === 'reasoning' ? event.item.text : JSON.stringify(event.item);
            this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'progress', ...(data === undefined ? {} : { data }), ...(event.timestamp === undefined ? {} : { timestamp: event.timestamp }) });
        }
        else if (event.type === 'turn_failed' || event.type === 'error') {
            this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'error', error: event.error });
        }
        else if (event.type === 'turn_canceled') {
            this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'cancel', data: event.reason });
        }
    }
    async attachWorkspace(ownerCtx, cwd, sessionId) {
        const registry = ownerCtx.get('workspaceRegistry');
        if (registry === undefined)
            return;
        const workspace = registry.list().find(candidate => candidate.path === cwd);
        if (workspace === undefined)
            return;
        await workspace.attachSession(String(sessionId));
    }
}
//# sourceMappingURL=service.js.map