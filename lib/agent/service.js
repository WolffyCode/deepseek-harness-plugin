import { agentEvents, } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { EngineSuiteChildBridge } from '../orchestration/bridge.js';
import { ExternalEngineBindingStore } from '../engine/bindings.js';
import { ExternalEngineAgent } from './external-engine-agent.js';
import { latestWorkspacePermission } from '../permission.js';
import { createCodexServerRequestHandler } from '../codex/requests.js';
import { normalizeExternalEngineEvent } from './runtime.js';
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
function codexSkillCommand(skill) {
    if (skill['enabled'] === false)
        return undefined;
    const name = commandString(skill['name'], '').trim();
    if (name.length === 0)
        return undefined;
    const metadata = typeof skill['interface'] === 'object' && skill['interface'] !== null && !Array.isArray(skill['interface'])
        ? skill['interface']
        : undefined;
    const description = commandString(skill['description'], commandString(metadata?.['shortDescription'], commandString(metadata?.['displayName'], '')));
    return { name, description, argumentHint: '', source: 'skill' };
}
async function codexCommands(runtime, cwd, refresh) {
    if (runtime.transport === undefined)
        throw new Error('Codex command catalog is unavailable');
    const response = await runtime.transport.request('skills/list', { cwds: [cwd], forceReload: refresh });
    const root = jsonObject(response, 'skills/list response');
    const entries = root['data'];
    if (!Array.isArray(entries))
        throw new Error('skills/list response.data must be an array');
    const commands = new Map();
    for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
            continue;
        const skills = entry['skills'];
        if (!Array.isArray(skills))
            continue;
        for (const value of skills) {
            if (typeof value !== 'object' || value === null || Array.isArray(value))
                continue;
            const command = codexSkillCommand(value);
            if (command !== undefined && !commands.has(command.name))
                commands.set(command.name, command);
        }
    }
    return [...commands.values()];
}
async function runtimeCommands(runtime, cwd, refresh) {
    const catalogRuntime = commandCatalogRuntime(runtime);
    if (catalogRuntime.session !== undefined) {
        const catalog = refresh ? await catalogRuntime.session.refreshCatalog() : { commands: catalogRuntime.session.listCommands() };
        const skills = new Set((catalog.skills ?? catalogRuntime.session.catalog.skills).map(skill => skill.name));
        return catalog.commands.map(command => normalizeCommand(command, skills));
    }
    return codexCommands(catalogRuntime, cwd, refresh);
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
 * services. Harness owns native Session creation; this service is entered only
 * by an explicit external-engine selection or child delegation.
 */
export class EngineSuiteAgentService {
    ctx;
    suite;
    resolveApiKey;
    hostAgentHandles;
    live = new Set();
    children = new Map();
    bindings;
    childBridge;
    childBridgeReady;
    lineageStore;
    closedSessions = new Map();
    childReservations = new Map();
    sessionOperations = new Map();
    constructor(ctx, suite, resolveApiKey, bindings = new ExternalEngineBindingStore(), lineageStore = createParentChildLineageStore(), hostAgentHandles) {
        this.ctx = ctx;
        this.suite = suite;
        this.resolveApiKey = resolveApiKey;
        this.hostAgentHandles = hostAgentHandles;
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
        return this.withSessionOperation(options.sessionId, async () => {
            const existing = this.findLiveSession(options.sessionId);
            if (existing !== undefined) {
                if (!sameSelection(existing.selection, options.selection)) {
                    await existing.updateSelection(options.selection, options.apiKey, latestWorkspacePermission(existing.session));
                }
                return existing;
            }
            return this.createExternalOn(this.ctx, options);
        });
    }
    async createCodex(options) {
        return this.createExternal({ ...options, selection: { ...options.selection, engineId: 'codex-cli' } });
    }
    async switchExternal(sessionId, selection, apiKey) {
        return this.withSessionOperation(sessionId, async () => {
            const handle = this.findLiveSession(sessionId);
            if (handle === undefined)
                throw new Error(`unknown Engine Suite session: ${sessionId}`);
            await handle.updateSelection(selection, apiKey, latestWorkspacePermission(handle.session));
            return handle;
        });
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
        const reservations = this.childReservations.get(parentSessionId) ?? 0;
        if (currentChildren.size + reservations >= parentProfile.maxConcurrentChildren) {
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
        this.lineageStore.append({ parentSessionId, nativeTaskId, childSessionId: String(childSessionId), type: 'start' });
        this.childReservations.set(parentSessionId, reservations + 1);
        let child;
        try {
            if (childDefinition.selection.engineId === 'deepseek-native') {
                return await this.delegateNative(parent, request, childDefinition.selection, depth, currentChildren, lineage);
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
            child = await this.createExternalOn(ownerCtx, {
                sessionId: String(childSessionId),
                selection: childDefinition.selection,
                apiKey: request.apiKey ?? await this.resolveApiKey(provider.credentialRef),
                cwd: parent.session.header.cwd ?? process.cwd(),
                ...request.executable === undefined ? {} : { executable: request.executable },
                ...request.args === undefined ? {} : { args: request.args },
                ...request.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: request.startupTimeoutMs },
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
            const current = this.lineageStore.getByChildSessionId(String(child.session.id));
            if ((current?.status === 'running' || current?.status === 'detached') && current.terminalStatus === undefined) {
                this.lineageStore.append({ parentSessionId, nativeTaskId, childSessionId: String(child.session.id), type: 'result', data: text });
            }
            return { handle: child, text, lineage: this.lineageStore.getByChildSessionId(String(child.session.id)) ?? lineage };
        }
        catch (error) {
            const current = this.lineageStore.getByChildSessionId(String(childSessionId));
            if (current?.status === 'running' && current.terminalStatus === undefined) {
                this.lineageStore.append({ parentSessionId, nativeTaskId, childSessionId: String(childSessionId), type: 'failure', error: error instanceof Error ? error.message : String(error) });
            }
            if (child !== undefined)
                await child.dispose().catch(() => { });
            throw error;
        }
        finally {
            const remaining = (this.childReservations.get(parentSessionId) ?? 1) - 1;
            if (remaining > 0)
                this.childReservations.set(parentSessionId, remaining);
            else
                this.childReservations.delete(parentSessionId);
        }
    }
    /** Optional AgentFactory entry for embedders that explicitly choose Engine Suite ownership. */
    async createAgent(ownerCtx, options) {
        return this.withSessionOperation(String(options.sessionId), async () => {
            const existing = this.findLiveSession(String(options.sessionId));
            if (existing !== undefined)
                return existing;
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
                runtimeRoot: binding.runtimeRoot,
                preserveRuntimeRoot: true,
                ...hasConversation ? {
                    resumeThreadId: binding.nativeSessionId,
                    engineId: binding.engineId,
                } : {},
                ...binding.executable === undefined ? {} : { executable: binding.executable },
                ...binding.args === undefined ? {} : { args: [...binding.args] },
                ...lineage === undefined ? {} : { parentSessionId: lineage.parentSessionId, delegationDepth: lineage.depth, nativeTaskId: lineage.nativeTaskId },
                ...parent === undefined ? {} : { parentAgent: parent.agent },
            });
            this.closedSessions.delete(id);
            if (lineage !== undefined) {
                const current = this.lineageStore.getByChildSessionId(id);
                if (current !== undefined && current.status !== 'running') {
                    this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: id, type: 'resume' });
                }
            }
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
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage === undefined)
            throw new Error(`unknown child Engine Suite session: ${id}`);
        if (live !== undefined) {
            if (lineage.status === 'detached') {
                this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: id, type: 'resume' });
            }
            return live;
        }
        const parent = [...this.live].find(candidate => String(candidate.session.id) === lineage.parentSessionId);
        const ownerCtx = parent?.agent.ctx ?? this.ctx;
        return this.resume(ownerCtx, { resumeSessionId: sessionId });
    }
    async archiveChild(childSessionId) {
        const id = String(SessionId(childSessionId));
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage === undefined)
            throw new Error(`unknown child Engine Suite session: ${id}`);
        if (lineage.status === 'archived')
            return lineage;
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
        this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: id, type: 'archive' });
        return this.lineageStore.getByChildSessionId(id) ?? lineage;
    }
    async detachChild(childSessionId) {
        const id = String(SessionId(childSessionId));
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage === undefined)
            throw new Error(`unknown child Engine Suite session: ${id}`);
        if (lineage.status === 'archived')
            throw new Error(`cannot detach archived child session ${id}`);
        if (lineage.status === 'detached')
            return lineage;
        const handle = [...this.live].find(candidate => String(candidate.session.id) === id);
        if (handle?.parentSessionId !== undefined) {
            const children = this.children.get(handle.parentSessionId);
            children?.delete(handle);
            if (children !== undefined && children.size === 0)
                this.children.delete(handle.parentSessionId);
        }
        this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: id, type: 'detach' });
        return this.lineageStore.getByChildSessionId(id) ?? lineage;
    }
    async cancelChild(childSessionId) {
        const id = String(SessionId(childSessionId));
        const lineage = this.lineageStore.getByChildSessionId(id);
        if (lineage === undefined)
            throw new Error(`unknown child Engine Suite session: ${id}`);
        if (lineage.status === 'archived' || lineage.terminalStatus === 'completed' || lineage.terminalStatus === 'failed' || lineage.terminalStatus === 'canceled')
            return lineage;
        const handle = [...this.live].find(candidate => String(candidate.session.id) === id);
        if (handle !== undefined) {
            handle.agent.cancel({ kind: 'user' });
            await handle.agent.whenIdle();
        }
        const current = this.lineageStore.getByChildSessionId(id);
        if (current?.status === 'running' || current?.status === 'detached') {
            this.lineageStore.append({ parentSessionId: current.parentSessionId, nativeTaskId: current.nativeTaskId, childSessionId: id, type: 'cancel' });
        }
        return this.lineageStore.getByChildSessionId(id) ?? lineage;
    }
    async cancelChildren(parentSessionId) {
        const children = [...this.children.get(parentSessionId) ?? []]
            .filter(child => this.shouldDisposeWithParent(child));
        await Promise.all(children.map(async (child) => {
            await this.cancelChild(String(child.session.id)).catch(() => undefined);
            await child.dispose().catch(() => undefined);
        }));
    }
    shouldDisposeWithParent(child) {
        return this.lineageStore.getByChildSessionId(String(child.session.id))?.status !== 'detached';
    }
    async delegateNative(parent, request, selection, depth, currentChildren, lineage) {
        const agents = parent.agent.ctx.get('agents');
        if (agents === undefined)
            throw new Error('DeepSeek Native child delegation requires Harness AgentRegistry');
        const childSessionId = SessionId(lineage.childSessionId);
        let handle;
        try {
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
            handle = {
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
            const current = this.lineageStore.getByChildSessionId(lineage.childSessionId);
            if ((current?.status === 'running' || current?.status === 'detached') && current.terminalStatus === undefined)
                this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'result', data: text });
            return { handle, text, lineage: this.lineageStore.getByChildSessionId(lineage.childSessionId) ?? lineage };
        }
        catch (error) {
            const current = this.lineageStore.getByChildSessionId(lineage.childSessionId);
            if (current?.status === 'running' && current.terminalStatus === undefined) {
                this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'failure', error: error instanceof Error ? error.message : String(error) });
            }
            if (handle !== undefined)
                await handle.dispose().catch(() => { });
            throw error;
        }
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
    findLiveSession(sessionId) {
        const id = String(SessionId(sessionId));
        return [...this.live].find(candidate => String(candidate.session.id) === id);
    }
    async withSessionOperation(sessionId, operation) {
        const id = String(SessionId(sessionId));
        const previous = this.sessionOperations.get(id) ?? Promise.resolve();
        const current = previous.then(operation);
        const settled = current.then(() => undefined, () => undefined);
        this.sessionOperations.set(id, settled);
        try {
            return await current;
        }
        finally {
            if (this.sessionOperations.get(id) === settled)
                this.sessionOperations.delete(id);
        }
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
        const existingAgent = agents.get(id);
        const existingExternal = this.findLiveSession(String(id));
        let nativeHandle;
        if (existingAgent !== undefined && existingExternal === undefined) {
            if (sessionHasConversation(session)) {
                throw new Error(`Engine selection is locked after the first turn: ${String(id)}`);
            }
            nativeHandle = await this.hostAgentHandles?.wait(String(id), existingAgent);
            if (nativeHandle === undefined) {
                throw new Error(`cannot attach an external Engine to blank Session ${String(id)}: another Agent is already attached`);
            }
        }
        let ownsSession = sessions.get(id) !== session;
        const runtimeRoot = options.runtimeRoot ?? this.bindings.runtimeRoot(String(id));
        const permissionPreset = latestWorkspacePermission(session);
        let agent;
        const approval = ownerCtx.get('approval');
        const serverRequestHandler = createCodexServerRequestHandler({ agent: () => agent, ...approval === undefined ? {} : { approval } });
        const bridge = profile.allowedChildProfiles.length === 0
            ? undefined
            : await this.childBridgeReady.then(() => this.childBridge.launchFor(String(id)));
        let bridgeActive = bridge !== undefined;
        const environment = { ...bridge?.environment ?? {} };
        const internalMcpSet = bridge === undefined
            ? undefined
            : { id: 'engine-suite-child-bridge', servers: [{ ...bridge.mcpServer, args: [...bridge.mcpServer.args] }] };
        let launch;
        try {
            launch = await this.suite.openEngine(options.selection, {
                apiKey: options.apiKey,
                cwd: options.cwd,
                runtimeRoot,
                preserveRuntimeRoot: options.preserveRuntimeRoot ?? true,
                ...options.resumeThreadId === undefined ? {} : { resumeThreadId: options.resumeThreadId },
                ...options.executable === undefined ? {} : { executable: options.executable },
                ...options.args === undefined ? {} : { args: options.args },
                ...options.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: options.startupTimeoutMs },
                ...permissionPreset === undefined ? {} : { permissionPreset },
                serverRequestHandler,
                environment,
                ...profile.engineId === 'codex-cli' ? { credentialResolver: this.resolveApiKey } : {},
                ...internalMcpSet === undefined ? {} : { internalMcpSet },
            });
        }
        catch (error) {
            if (bridgeActive)
                this.childBridge.release(String(id));
            throw error;
        }
        let detachSession;
        let detachAgent;
        let detachLineageRuntime;
        let handle;
        try {
            if (existingAgent !== undefined && existingExternal === undefined) {
                const takenNativeHandle = this.hostAgentHandles?.take(String(id), existingAgent);
                if (takenNativeHandle === undefined || takenNativeHandle !== nativeHandle) {
                    throw new Error(`cannot replace the native Agent for blank Session ${String(id)}`);
                }
                await takenNativeHandle.dispose();
                ownsSession = true;
            }
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
            let activeLaunch = launch;
            let activeApiKey = options.apiKey;
            let activeEnvironment = environment;
            let activeInternalMcpSet = internalMcpSet;
            let commandCatalog;
            let commandOperation;
            let commandClosed = false;
            let disposePromise;
            const lineage = options.parentSessionId === undefined || options.nativeTaskId === undefined
                ? undefined
                : this.lineageStore.getByChildSessionId(String(id));
            const observeRuntime = (runtime, runtimeProvider = provider.id) => {
                if (lineage === undefined)
                    return;
                detachLineageRuntime = runtime.onEvent(rawEvent => {
                    const event = normalizeExternalEngineEvent(rawEvent, runtimeProvider, runtime.turnId);
                    if (event !== undefined)
                        this.observeChildRuntimeEvent(lineage, event);
                });
            };
            handle = {
                agent,
                session,
                ...options.parentSessionId === undefined ? {} : { parentSessionId: options.parentSessionId },
                ...options.nativeTaskId === undefined ? {} : { nativeTaskId: options.nativeTaskId },
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
                    const nextEnvironment = { ...nextBridge?.environment ?? {} };
                    const nextInternalMcpSet = nextBridge === undefined
                        ? undefined
                        : { id: 'engine-suite-child-bridge', servers: [{ ...nextBridge.mcpServer, args: [...nextBridge.mcpServer.args] }] };
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
                        ...options.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: options.startupTimeoutMs },
                        ...nextPermissionPreset === undefined ? {} : { permissionPreset: nextPermissionPreset },
                        serverRequestHandler,
                        environment: nextEnvironment,
                        ...nextProfile.engineId === 'codex-cli' ? { credentialResolver: this.resolveApiKey } : {},
                        ...nextInternalMcpSet === undefined ? {} : { internalMcpSet: nextInternalMcpSet },
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
                        if (nextBridge !== undefined && !bridgeActive)
                            this.childBridge.release(String(id));
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
                                ...options.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: options.startupTimeoutMs },
                                ...previousPermissionPreset === undefined ? {} : { permissionPreset: previousPermissionPreset },
                                serverRequestHandler,
                                environment: activeEnvironment,
                                ...previousSelection.engineId === 'codex-cli' ? { credentialResolver: this.resolveApiKey } : {},
                                ...activeInternalMcpSet === undefined ? {} : { internalMcpSet: activeInternalMcpSet },
                            });
                            activeLaunch = restored;
                        }
                        catch {
                            // Keep the original failure; the next user action can recreate the runtime through resume.
                        }
                        throw error;
                    }
                    detachLineageRuntime?.();
                    detachLineageRuntime = undefined;
                    agent.replaceRuntime(nextLaunch.runtime, nextProvider.id, nextModel.modelId);
                    activeLaunch = nextLaunch;
                    observeRuntime(activeLaunch.runtime, nextProvider.id);
                    if (bridgeActive && nextBridge === undefined)
                        this.childBridge.release(String(id));
                    bridgeActive = nextBridge !== undefined;
                    activeApiKey = nextApiKey;
                    activeEnvironment = nextEnvironment;
                    activeInternalMcpSet = nextInternalMcpSet;
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
                        ...options.executable === undefined ? {} : { executable: options.executable },
                        ...options.args === undefined ? {} : { args: [...options.args] },
                    });
                },
                dispose: () => {
                    if (disposePromise !== undefined)
                        return disposePromise;
                    disposePromise = (async () => {
                        await this.cancelChildren(String(id));
                        this.children.delete(String(id));
                        this.closedSessions.set(String(id), session);
                        this.live.delete(handle);
                        commandClosed = true;
                        commandCatalog = undefined;
                        commandOperation = undefined;
                        detachLineageRuntime?.();
                        detachLineageRuntime = undefined;
                        if (bridgeActive)
                            this.childBridge.release(String(id));
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
            observeRuntime(activeLaunch.runtime);
            this.live.add(handle);
            ownerCtx.effect(() => () => {
                if (this.shouldDisposeWithParent(handle))
                    void handle.dispose();
            }, `engine-suite.agent(${String(id)})`);
            await this.attachWorkspace(ownerCtx, session.header.cwd ?? options.cwd, id);
            await this.bindings.put({
                sessionId: String(id),
                engineId: options.engineId ?? profile.engineId,
                nativeSessionId: launch.nativeSessionId,
                runtimeRoot: activeLaunch.runtimeRoot,
                selection: options.selection,
                ...options.executable === undefined ? {} : { executable: options.executable },
                ...options.args === undefined ? {} : { args: [...options.args] },
            });
            return handle;
        }
        catch (error) {
            detachLineageRuntime?.();
            detachLineageRuntime = undefined;
            if (handle !== undefined) {
                await handle.dispose().catch(() => { });
            }
            else {
                if (bridgeActive)
                    this.childBridge.release(String(id));
                await agent?.dispose().catch(() => { });
                detachAgent?.();
                detachSession?.();
                await launch.close();
            }
            throw error;
        }
    }
    observeChildRuntimeEvent(lineage, event) {
        const current = this.lineageStore.getByChildSessionId(lineage.childSessionId);
        if (current === undefined || current.terminalStatus !== undefined || (current.status !== 'running' && current.status !== 'detached'))
            return;
        if (event.type === 'timeline') {
            const data = event.item.type === 'assistant_message' || event.item.type === 'reasoning' ? event.item.text : JSON.stringify(event.item);
            this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'progress', ...(data === undefined ? {} : { data }), ...(event.timestamp === undefined ? {} : { timestamp: event.timestamp }) });
        }
        else if (event.type === 'reasoning') {
            this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'progress', data: event.text });
        }
        else if (event.type === 'turn_failed' || event.type === 'error') {
            this.lineageStore.append({ parentSessionId: lineage.parentSessionId, nativeTaskId: lineage.nativeTaskId, childSessionId: lineage.childSessionId, type: 'failure', error: event.error });
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