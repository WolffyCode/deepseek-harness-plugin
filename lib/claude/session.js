import { randomUUID } from 'node:crypto';
import { ClaudeCredentialRedactor, ClaudeSdkTransport } from './transport.js';
import { ClaudeProcess, claudeProcessRedactions } from './process.js';
import { isClaudeUserAgentDefinitions } from './types.js';
import { ControlError, PermissionRegistry, toAskUserQuestion, toPermissionRequest, toSdkPermissionResult, toUserDialogRequest, } from './control.js';
import { ClaudeCatalogCache } from './catalog.js';
import { toForwardPayload } from './commands.js';
import { materializeClaudeMcpOptions } from './mcp.js';
import { materializeClaudeSkills } from './skills.js';
import { createSubagentReducer } from './subagents.js';
import { realClaudeRewindSdk, rewindClaude } from './rewind.js';
import { ClaudeCapabilityError, getClaudeSessionHistory, normalizeClaudePersistenceHandle, realClaudeSdkGateway } from './persistence.js';
import { NextTurnStateMachine } from './control.js';
const capabilities = Object.freeze({
    supportsStreaming: true,
    supportsSessionPersistence: true,
    supportsSessionListing: true,
    supportsDynamicModes: true,
    supportsMcpServers: true,
    supportsReasoningStream: true,
    supportsToolInvocations: true,
    supportsPermissionRequests: true,
    supportsUserQuestions: true,
    supportsSlashCommands: true,
    supportsInterrupt: true,
    supportsSteer: true,
    supportsRewind: true,
    supportsFork: true,
    supportsSubagents: true,
    supportsBackgroundAgents: true,
});
/** Returns true when a model identifier or SDK catalog row names an Opus model. */
export function isOpusModel(value) {
    if (typeof value === 'string')
        return value.toLowerCase().includes('opus');
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const record = value;
    return ['value', 'displayName', 'resolvedModel'].some(key => isOpusModel(record[key]));
}
/** Filters every Claude SDK catalog row whose alias, label, or resolved model is Opus. */
export function filterClaudeCatalogModels(models) {
    return models.filter(model => !isOpusModel(model));
}
export function assertClaudeModelAllowed(model) {
    if (model !== undefined && isOpusModel(model)) {
        const detail = typeof model === 'string' ? `: ${model}` : '';
        throw new Error(`Claude Opus models are not supported by this plugin${detail}`);
    }
}
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
function stringValue(value) { return typeof value === 'string' ? value : undefined; }
function numberValue(value) { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function boolValue(value) { return typeof value === 'boolean' ? value : undefined; }
function serialize(value) {
    if (typeof value === 'string')
        return value;
    try {
        return JSON.stringify(value) ?? '';
    }
    catch {
        return '';
    }
}
function contentText(value) {
    if (typeof value === 'string')
        return value;
    if (!Array.isArray(value))
        return serialize(value);
    return value.map(item => {
        const record = asRecord(item);
        return stringValue(record?.['text']) ?? stringValue(record?.['content']) ?? '';
    }).join('');
}
function appendTail(current, chunk, maxBytes = 4_000) {
    const next = current + chunk;
    return Buffer.byteLength(next, 'utf8') <= maxBytes ? next : next.slice(-maxBytes);
}
const CLAUDE_PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'];
function isClaudePermissionMode(value) {
    return CLAUDE_PERMISSION_MODES.includes(value);
}
function normalizeSdkSlashCommand(value) {
    const record = asRecord(value);
    if (record === undefined)
        return undefined;
    const name = stringValue(record['name']);
    if (name === undefined)
        return undefined;
    const description = stringValue(record['description']) ?? '';
    const argumentHint = stringValue(record['argumentHint']) ?? '';
    const aliases = record['aliases'];
    if (aliases !== undefined && (!Array.isArray(aliases) || !aliases.every(alias => typeof alias === 'string')))
        return undefined;
    return { name, description, argumentHint, ...(aliases === undefined ? {} : { aliases: [...aliases] }) };
}
function normalizeSdkModel(value) {
    const record = asRecord(value);
    if (record === undefined)
        return undefined;
    const wireValue = stringValue(record['value']);
    const explicitId = stringValue(record['id']);
    const modelValue = explicitId ?? wireValue ?? stringValue(record['name']);
    if (modelValue === undefined)
        return undefined;
    const displayName = stringValue(record['displayName']) ?? modelValue;
    const description = stringValue(record['description']) ?? '';
    const resolvedModel = stringValue(record['resolvedModel']) ?? (explicitId !== undefined && wireValue !== undefined && explicitId !== wireValue ? wireValue : undefined);
    const supportsEffort = typeof record['supportsEffort'] === 'boolean' ? record['supportsEffort'] : undefined;
    const supportedEffortLevels = Array.isArray(record['supportedEffortLevels']) && record['supportedEffortLevels'].every(level => level === 'low' || level === 'medium' || level === 'high' || level === 'xhigh' || level === 'max')
        ? record['supportedEffortLevels']
        : undefined;
    const supportsAdaptiveThinking = typeof record['supportsAdaptiveThinking'] === 'boolean' ? record['supportsAdaptiveThinking'] : undefined;
    const supportsFastMode = typeof record['supportsFastMode'] === 'boolean' ? record['supportsFastMode'] : undefined;
    const supportsAutoMode = typeof record['supportsAutoMode'] === 'boolean' ? record['supportsAutoMode'] : undefined;
    return {
        value: modelValue,
        displayName,
        description,
        ...(resolvedModel === undefined ? {} : { resolvedModel }),
        ...(supportsEffort === undefined ? {} : { supportsEffort }),
        ...(supportedEffortLevels === undefined ? {} : { supportedEffortLevels }),
        ...(supportsAdaptiveThinking === undefined ? {} : { supportsAdaptiveThinking }),
        ...(supportsFastMode === undefined ? {} : { supportsFastMode }),
        ...(supportsAutoMode === undefined ? {} : { supportsAutoMode }),
    };
}
function permissionDecisionForSdk(decision) {
    if (decision.behavior === 'deny')
        return decision;
    const updatedInput = asRecord(decision.updatedInput);
    return {
        behavior: 'allow',
        ...(updatedInput === undefined ? {} : { updatedInput }),
        ...(decision.updatedPermissions === undefined ? {} : { updatedPermissions: decision.updatedPermissions }),
        ...(decision.toolUseID === undefined ? {} : { toolUseID: decision.toolUseID }),
        ...(decision.decisionClassification === undefined ? {} : { decisionClassification: decision.decisionClassification }),
    };
}
function controlPermissionResponse(decision) {
    if (decision.behavior === 'deny') {
        return {
            behavior: 'deny',
            message: decision.message,
            ...(decision.interrupt === undefined ? {} : { interrupt: decision.interrupt }),
            ...(decision.toolUseID === undefined ? {} : { toolUseId: decision.toolUseID }),
            ...(decision.decisionClassification === undefined ? {} : { decisionClassification: decision.decisionClassification }),
        };
    }
    const updatedInput = asRecord(decision.updatedInput);
    return {
        behavior: 'allow',
        ...(updatedInput === undefined ? {} : { updatedInput }),
        ...(decision.updatedPermissions === undefined ? {} : { updatedPermissions: decision.updatedPermissions }),
        ...(decision.toolUseID === undefined ? {} : { toolUseId: decision.toolUseID }),
        ...(decision.decisionClassification === undefined ? {} : { decisionClassification: decision.decisionClassification }),
    };
}
function claudePermissionRequest(request, signal = new AbortController().signal) {
    return {
        requestId: request.requestId,
        toolName: request.toolName,
        input: request.input,
        ...(request.toolUseId === undefined ? {} : { toolUseId: request.toolUseId }),
        ...(request.title === undefined ? {} : { title: request.title }),
        ...(request.description === undefined ? {} : { description: request.description }),
        ...(request.decisionReason === undefined ? {} : { reason: request.decisionReason }),
        signal,
    };
}
function claudePermissionDecision(decision) {
    if (decision.behavior === 'deny')
        return decision;
    return {
        behavior: 'allow',
        ...(decision.updatedInput === undefined ? {} : { updatedInput: decision.updatedInput }),
        ...(decision.updatedPermissions === undefined ? {} : { updatedPermissions: decision.updatedPermissions }),
        ...(decision.toolUseID === undefined ? {} : { toolUseID: decision.toolUseID }),
        ...(decision.decisionClassification === undefined ? {} : { decisionClassification: decision.decisionClassification }),
    };
}
export function parseClaudeUserAgentDefinitions(value) {
    if (value === undefined)
        return undefined;
    if (!isClaudeUserAgentDefinitions(value)) {
        throw new Error("Claude agents input is rejected: expected { source: 'user', definitions: Record<string, AgentDefinition> } with user-authored Claude subagent definitions; Harness or cross-engine agent maps cannot enter Claude SDK options");
    }
    for (const [name, definition] of Object.entries(value.definitions)) {
        const entry = definition;
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry) || typeof entry['description'] !== 'string' || typeof entry['prompt'] !== 'string') {
            throw new Error(`Claude user agent definition '${name}' requires string 'description' and 'prompt'`);
        }
    }
    return { ...value.definitions };
}
function usageOf(value, message) {
    const usage = asRecord(value) ?? {};
    const inputTokens = numberValue(usage['input_tokens']) ?? numberValue(usage['inputTokens']);
    const cachedInputTokens = numberValue(usage['cache_read_input_tokens']) ?? numberValue(usage['cachedInputTokens']);
    const outputTokens = numberValue(usage['output_tokens']) ?? numberValue(usage['outputTokens']);
    const totalCostUsd = numberValue(message['total_cost_usd']) ?? numberValue(usage['total_cost_usd']);
    const contextWindowMaxTokens = numberValue(usage['context_window_max_tokens']);
    const contextWindowUsedTokens = numberValue(usage['context_window_used_tokens']);
    if ([inputTokens, cachedInputTokens, outputTokens, totalCostUsd, contextWindowMaxTokens, contextWindowUsedTokens].every(value => value === undefined))
        return undefined;
    return {
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
        ...(totalCostUsd === undefined ? {} : { totalCostUsd }),
        ...(contextWindowMaxTokens === undefined ? {} : { contextWindowMaxTokens }),
        ...(contextWindowUsedTokens === undefined ? {} : { contextWindowUsedTokens }),
    };
}
export class ClaudeProviderSession {
    capabilities;
    options;
    redactor;
    userAgentDefinitions;
    transport;
    listeners = new Set();
    permissionRegistry;
    catalogCache;
    subagentReducer = createSubagentReducer();
    rewindSdk;
    persistenceGateway;
    modelState;
    modeState;
    thinkingState;
    pendingQuestionsMap = new Map();
    toolInputByIndex = new Map();
    toolMetaByIndex = new Map();
    unsubscribeTransport;
    activeTurn;
    stderrTail = '';
    turnSequence = 0;
    closed = false;
    nativeSessionId;
    _sessionId;
    _forked = false;
    readyPromise;
    readyResolve;
    readyReject;
    readySettled = false;
    readyError;
    turnStarting = false;
    sessionStartedEmitted = false;
    _catalog = {
        models: [], commands: [], modes: [], skills: [], mcpServers: [], capabilities: [],
    };
    constructor(options) {
        this.options = options;
        if (options.resumeSessionId !== undefined && options.sessionId !== undefined && options.forkSession !== true) {
            throw new Error('Claude sessionId cannot be combined with resumeSessionId unless forkSession is enabled');
        }
        this.nativeSessionId = options.sessionId
            ?? (options.resumeSessionId === undefined || options.forkSession === true ? randomUUID() : options.resumeSessionId);
        this.redactor = ClaudeCredentialRedactor.fromAdapterOptions(options);
        this.permissionRegistry = new PermissionRegistry({ ...(options.permissionTimeoutMs === undefined ? {} : { defaultTimeoutMs: options.permissionTimeoutMs }) });
        this.modelState = new NextTurnStateMachine(options.model);
        this.modeState = new NextTurnStateMachine(options.permissionMode);
        this.thinkingState = new NextTurnStateMachine(options.thinking);
        this.rewindSdk = options.rewindSdk ?? realClaudeRewindSdk;
        this.persistenceGateway = options.persistenceGateway ?? realClaudeSdkGateway;
        this.capabilities = Object.freeze({
            ...capabilities,
            supportsSessionPersistence: options.persistSession !== false,
        });
        try {
            if (options.mcpAssets !== undefined && options.mcpServers !== undefined)
                throw new Error('Claude MCP assets and materialized MCP servers are mutually exclusive');
            if (options.skillAssets !== undefined && (options.skillPlugins !== undefined || options.additionalDirectories !== undefined))
                throw new Error('Claude Skill assets and materialized Skill paths are mutually exclusive');
            assertClaudeModelAllowed(options.model);
            this.userAgentDefinitions = parseClaudeUserAgentDefinitions(options.agents);
            this.transport = new ClaudeSdkTransport(this.buildSdkOptions(), options.queryFactory, this.redactor);
        }
        catch (error) {
            throw this.redactor.redactError(error);
        }
        this.catalogCache = new ClaudeCatalogCache({
            supportedCommands: async () => (await this.transport.query.supportedCommands()).flatMap(value => {
                const normalized = normalizeSdkSlashCommand(value);
                return normalized === undefined ? [] : [normalized];
            }),
            supportedModels: async () => (await this.transport.query.supportedModels()).flatMap(value => {
                const normalized = normalizeSdkModel(value);
                return normalized === undefined || isOpusModel(normalized) ? [] : [normalized];
            }),
        }, { ...(options.catalogTtlMs === undefined ? {} : { ttlMs: options.catalogTtlMs }) });
        this.unsubscribeTransport = this.transport.subscribe(event => this.handleTransportEvent(event));
    }
    get sessionId() { return this._sessionId; }
    get catalog() { return this._catalog; }
    whenReady() {
        if (this.readyPromise !== undefined)
            return this.readyPromise;
        if (this.readyError !== undefined)
            return Promise.reject(this.readyError);
        if (this.closed)
            return Promise.reject(new Error('Claude session is closed before initialization'));
        this.readyPromise = new Promise((resolve, reject) => {
            this.readyResolve = resolve;
            this.readyReject = reject;
        });
        void this.initializeReadiness();
        return this.readyPromise;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    async startTurn(prompt, options = {}) {
        return this.beginTurn(prompt, options);
    }
    async run(prompt, options = {}) {
        let resolve;
        let reject;
        const completion = new Promise((resolveResult, rejectResult) => {
            resolve = resolveResult;
            reject = rejectResult;
        });
        await this.beginTurn(prompt, options, { resolve, reject });
        return completion;
    }
    async interrupt() {
        if (this.closed)
            return;
        try {
            await this.transport.interrupt();
        }
        catch (error) {
            throw this.redactor.redactError(error);
        }
        const turn = this.activeTurn;
        if (!turn)
            return;
        this.emit({ type: 'turn_canceled', turnId: turn.id });
        turn.resolve?.({ sessionId: this._sessionId, turnId: turn.id, finalText: turn.finalText, usage: turn.usage });
        this.activeTurn = undefined;
    }
    async close() {
        if (this.closed)
            return;
        const closeError = this.readyPromise !== undefined && !this.readySettled
            ? new Error('Claude session closed before initialization')
            : undefined;
        await this.closeTransport(closeError);
    }
    async setMode(mode) {
        if (this.closed)
            throw new Error('Claude session is closed');
        if (!isClaudePermissionMode(mode))
            throw new Error(`Unsupported Claude permission mode: ${mode}`);
        this.modeState.request(mode);
        this.emit({ type: 'status_changed', status: 'mode_change_queued', metadata: { mode, applies: 'next-turn' } });
        if (!this.activeTurn && !this.turnStarting)
            await this.applyPendingTurnSettings();
    }
    async setPermissionMode(mode) { await this.setMode(mode); }
    async setModel(model) {
        if (this.closed)
            throw new Error('Claude session is closed');
        assertClaudeModelAllowed(model);
        this.modelState.request(model);
        this.emit({ type: 'status_changed', status: 'model_change_queued', metadata: { ...(model === undefined ? {} : { model }), applies: 'next-turn' } });
        if (!this.activeTurn && !this.turnStarting)
            await this.applyPendingTurnSettings();
    }
    async setThinking(thinking) {
        if (this.closed)
            throw new Error('Claude session is closed');
        this.thinkingState.request(thinking);
        this.emit({ type: 'status_changed', status: 'thinking_change_queued', metadata: { thinking, applies: 'next-turn' } });
        if (!this.activeTurn && !this.turnStarting)
            await this.applyPendingTurnSettings();
    }
    async steer(prompt) {
        if (this.closed || !this.activeTurn)
            return { status: 'unavailable' };
        try {
            this.transport.send(this.inputMessage(prompt, true));
            return { status: 'accepted' };
        }
        catch (error) {
            const redacted = this.redactor.redactError(error);
            this.emit({ type: 'turn_failed', turnId: this.activeTurn.id, error: redacted.message });
            this.activeTurn.reject?.(redacted);
            this.activeTurn = undefined;
            throw redacted;
        }
    }
    respondToPermission(requestId, decision) {
        const response = controlPermissionResponse(decision);
        const outcome = this.permissionRegistry.respond(requestId, response);
        if (!outcome.ok)
            return false;
        this.emit({ type: 'permission_resolved', requestId, decision });
        return true;
    }
    respondToUserQuestion(requestId, result) {
        const pending = this.pendingQuestionsMap.get(requestId);
        if (!pending)
            return false;
        this.finishUserQuestion(requestId, result);
        return true;
    }
    pendingPermissions() {
        return this.permissionRegistry.pending().map(request => claudePermissionRequest(request));
    }
    persistenceHandle() {
        if (this.options.persistSession === false || this._sessionId === undefined)
            return undefined;
        return normalizeClaudePersistenceHandle({
            provider: 'claude-cli',
            sessionId: this._sessionId,
            nativeHandle: this._sessionId,
            cwd: this.options.cwd,
            ...(this._forked ? { forked: true } : {}),
        });
    }
    async history(options = {}) {
        if (this.options.persistSession === false) {
            throw new ClaudeCapabilityError('session-history', 'persistSession is disabled');
        }
        const handle = this.persistenceHandle();
        if (handle === undefined) {
            throw new ClaudeCapabilityError('session-history', 'the native session id is not available before initialization');
        }
        const sessionStore = options.sessionStore ?? this.options.sessionStore;
        return getClaudeSessionHistory(this.persistenceGateway, handle, {
            ...options,
            ...(sessionStore === undefined ? {} : { sessionStore }),
        });
    }
    async reconnect() {
        if (this.options.persistSession === false) {
            throw new ClaudeCapabilityError('session-reconnect', 'persistSession is disabled');
        }
        const handle = this.persistenceHandle();
        if (handle === undefined) {
            throw new ClaudeCapabilityError('session-reconnect', 'the native session id is not available before initialization');
        }
        const { sessionId: _sessionId, resumeSessionId: _resumeSessionId, forkSession: _forkSession, ...reconnectOptions } = this.options;
        return new ClaudeProviderSession({
            ...reconnectOptions,
            resumeSessionId: handle.nativeHandle,
        });
    }
    listCommands() { return this._catalog.commands; }
    async refreshCatalog() {
        try {
            const loaded = await this.catalogCache.loadAll();
            if (loaded.commands.status === 'failure' && loaded.commands.value === undefined)
                throw loaded.commands.error;
            if (loaded.models.status === 'failure' && loaded.models.value === undefined)
                throw loaded.models.error;
            const commands = loaded.commands.status === 'ok' ? loaded.commands.value : (loaded.commands.value ?? []);
            const models = loaded.models.status === 'ok' ? loaded.models.value : (loaded.models.value ?? []);
            const query = this.transportQuery();
            const mcpServers = typeof query.mcpServerStatus === 'function' ? await query.mcpServerStatus() : [];
            this._catalog = {
                ...this._catalog,
                commands: commands.map(command => this.mapCatalogCommand(command)),
                models: filterClaudeCatalogModels(models).map(model => this.mapCatalogModel(model)),
                mcpServers: mcpServers.map(value => this.mapMcp(value)),
            };
            this.emit({ type: 'catalog_changed', catalog: this._catalog });
            return this._catalog;
        }
        catch (error) {
            throw this.redactor.redactError(error);
        }
    }
    async rewind(input) {
        if (this.closed)
            throw new Error('Claude session is closed');
        try {
            const result = await rewindClaude({
                mode: input.mode,
                messageId: input.messageId,
                ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
                ...(input.resolveMessageId === undefined ? {} : { resolveMessageId: input.resolveMessageId }),
                ...(this._sessionId === undefined ? {} : { sessionId: this._sessionId }),
                sdk: this.rewindSdk,
                query: this.transportQuery(),
                setSessionId: sessionId => {
                    this._sessionId = sessionId;
                    this._forked = true;
                    this._catalog = { ...this._catalog, model: this._catalog.model };
                },
            });
            if (result.sessionId !== undefined) {
                this.emit({ type: 'status_changed', status: 'session_rewound', metadata: { sessionId: result.sessionId, messageId: result.messageId } });
            }
            return result;
        }
        catch (error) {
            throw this.redactor.redactError(error);
        }
    }
    async initializeReadiness() {
        try {
            const query = this.transportQuery();
            const initializationResult = query.initializationResult;
            if (typeof initializationResult === 'function') {
                const result = await initializationResult.call(query);
                if (this.closed)
                    return;
                this.applyInitializationResult(result);
            }
            if (this.closed)
                return;
            if (this._sessionId === undefined) {
                this._sessionId = this.nativeSessionId;
                this.emitSessionStarted();
            }
            this.resolveReady();
        }
        catch (error) {
            if (this.closed && this.readySettled)
                return;
            await this.failInitialization(this.redactor.redactError(error));
        }
    }
    resolveReady() {
        if (this.readySettled)
            return;
        this.readySettled = true;
        this.readyResolve?.();
        this.readyResolve = undefined;
        this.readyReject = undefined;
    }
    rejectReady(error) {
        if (this.readySettled)
            return;
        this.readySettled = true;
        this.readyError = error;
        this.readyReject?.(error);
        this.readyResolve = undefined;
        this.readyReject = undefined;
    }
    async failInitialization(error) {
        const redacted = this.redactor.redactError(error);
        this.rejectReady(redacted);
        await this.closeTransport(redacted);
    }
    async closeTransport(reason) {
        if (this.closed)
            return;
        this.closed = true;
        this.unsubscribeTransport();
        if (reason !== undefined) {
            this.rejectReady(reason);
        }
        else if (this.readyPromise !== undefined && !this.readySettled) {
            const closeError = new Error('Claude session closed before initialization');
            this.rejectReady(closeError);
        }
        const turn = this.activeTurn;
        if (turn !== undefined) {
            const error = this.redactor.redactError(reason ?? new Error('Claude session closed while a turn was active'));
            turn.reject?.(error);
            this.emit({ type: 'turn_failed', turnId: turn.id, error: error.message });
            this.activeTurn = undefined;
        }
        this.permissionRegistry.cancelAll();
        for (const requestId of [...this.pendingQuestionsMap.keys()])
            this.finishUserQuestion(requestId, { behavior: 'cancelled' });
        this.catalogCache.close();
        try {
            await this.transport.close();
        }
        catch (error) {
            if (reason === undefined)
                throw this.redactor.redactError(error);
        }
    }
    applyInitializationResult(result) {
        const commands = Array.isArray(result.commands)
            ? result.commands.map(value => this.mapCommand(value))
            : this._catalog.commands;
        const models = Array.isArray(result.models)
            ? filterClaudeCatalogModels(result.models).map(value => this.mapModel(value))
            : this._catalog.models;
        this._catalog = { ...this._catalog, commands, models };
    }
    async beginTurn(prompt, options, completion) {
        if (this.closed)
            throw new Error('Claude session is closed');
        if (!prompt.trim())
            throw new Error('Claude prompt must not be empty');
        if (this.activeTurn || this.turnStarting)
            throw new Error('Claude session already has an active turn');
        const slash = prompt.startsWith('/') ? toForwardPayload(prompt) : undefined;
        if (slash !== undefined && !slash.ok)
            throw new Error(slash.message);
        this.turnStarting = true;
        const turnId = `claude-turn-${++this.turnSequence}`;
        try {
            await this.whenReady();
            if (this.closed)
                throw new Error('Claude session is closed');
            await this.applyPendingTurnSettings();
            this.activeTurn = { id: turnId, finalText: '', ...completion };
            this.toolInputByIndex.clear();
            this.toolMetaByIndex.clear();
            this.emit({ type: 'turn_started', turnId, ...(this._sessionId === undefined ? {} : { sessionId: this._sessionId }) });
            const content = slash?.ok === true ? slash.forwardRaw : prompt;
            this.transport.send(this.inputMessage(content, true, options.clientMessageId === undefined ? undefined : randomUUID()));
            return { turnId };
        }
        catch (error) {
            const redacted = this.redactor.redactError(error);
            this.emit({ type: 'turn_failed', turnId, error: redacted.message });
            completion?.reject?.(redacted);
            this.activeTurn = undefined;
            throw redacted;
        }
        finally {
            this.turnStarting = false;
        }
    }
    async applyPendingTurnSettings() {
        const modelRequest = this.modelState.snapshot().request;
        const modeRequest = this.modeState.snapshot().request;
        const thinkingRequest = this.thinkingState.snapshot().request;
        if (modelRequest === undefined && modeRequest === undefined && thinkingRequest === undefined)
            return;
        const query = this.transportQuery();
        const applied = [];
        try {
            if (modelRequest !== undefined) {
                await query.setModel(modelRequest.value);
                applied.push('model');
            }
            if (modeRequest !== undefined) {
                if (modeRequest.value === undefined)
                    throw new Error('Claude permission mode cannot be undefined');
                await query.setPermissionMode(modeRequest.value);
                applied.push('mode');
            }
            if (thinkingRequest !== undefined && thinkingRequest.value !== undefined) {
                await this.applyThinkingToQuery(query, thinkingRequest.value);
                applied.push('thinking');
            }
            if (modelRequest !== undefined) {
                const result = this.modelState.commit(modelRequest);
                if (!result.ok)
                    throw result.error;
            }
            if (modeRequest !== undefined) {
                const result = this.modeState.commit(modeRequest);
                if (!result.ok)
                    throw result.error;
            }
            if (thinkingRequest !== undefined) {
                const result = this.thinkingState.commit(thinkingRequest);
                if (!result.ok)
                    throw result.error;
            }
            const model = this.modelState.current;
            const permissionMode = this.modeState.current;
            this._catalog = {
                ...this._catalog,
                ...(model === undefined ? { model: undefined } : { model }),
                ...(permissionMode === undefined ? { permissionMode: undefined } : { permissionMode }),
            };
            this.emit({ type: 'catalog_changed', catalog: this._catalog });
        }
        catch (error) {
            await this.restoreAppliedTurnSettings(query, applied).catch(() => undefined);
            if (modelRequest !== undefined)
                this.modelState.rollback(modelRequest);
            if (modeRequest !== undefined)
                this.modeState.rollback(modeRequest);
            if (thinkingRequest !== undefined)
                this.thinkingState.rollback(thinkingRequest);
            throw this.redactor.redactError(error);
        }
    }
    async applyThinkingToQuery(query, thinking) {
        if (thinking.type === 'adaptive') {
            const applyFlagSettings = query.applyFlagSettings;
            if (typeof applyFlagSettings === 'function') {
                await applyFlagSettings.call(query, { thinking });
            }
            else {
                await query.setMaxThinkingTokens(null, thinking.display);
            }
            return;
        }
        if (thinking.type === 'disabled') {
            await query.setMaxThinkingTokens(0);
            return;
        }
        await query.setMaxThinkingTokens(thinking.budgetTokens ?? null, thinking.display);
    }
    async restoreAppliedTurnSettings(query, applied) {
        for (const setting of [...applied].reverse()) {
            if (setting === 'model')
                await query.setModel(this.modelState.current);
            else if (setting === 'mode') {
                if (this.modeState.current !== undefined)
                    await query.setPermissionMode(this.modeState.current);
            }
            else if (this.thinkingState.current !== undefined)
                await this.applyThinkingToQuery(query, this.thinkingState.current);
        }
    }
    inputMessage(prompt, shouldQuery, uuid) {
        return { type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null, shouldQuery, ...(uuid === undefined ? {} : { uuid }) };
    }
    buildSdkOptions() {
        const env = { ...this.options.environment };
        if (this.options.baseUri !== undefined)
            env['ANTHROPIC_BASE_URL'] = this.options.baseUri;
        if (this.options.authToken !== undefined)
            env['ANTHROPIC_AUTH_TOKEN'] = this.options.authToken;
        const canUseTool = async (toolName, input, requestOptions) => this.requestPermission(toolName, input, requestOptions);
        const onUserDialog = async (request, requestOptions) => this.requestUserQuestion(request, requestOptions);
        const mcpFragment = this.options.mcpAssets === undefined
            ? undefined
            : materializeClaudeMcpOptions(this.options.mcpAssets, {
                ...(this.options.credentialResolver === undefined ? {} : { credentialResolver: this.options.credentialResolver }),
            });
        const skillFragment = this.options.skillAssets === undefined ? undefined : materializeClaudeSkills(this.options.skillAssets);
        const mcpServers = mcpFragment === undefined ? this.options.mcpServers : mcpFragment.mcpServers;
        const plugins = skillFragment?.plugins ?? (this.options.skillPlugins === undefined ? undefined : this.options.skillPlugins.map(path => ({ type: 'local', path })));
        const additionalDirectories = skillFragment?.additionalDirectories ?? this.options.additionalDirectories;
        const supportedDialogKinds = this.options.supportedDialogKinds ?? ['ask_user_question'];
        return {
            cwd: this.options.cwd,
            env,
            stderr: data => {
                this.stderrTail = appendTail(this.stderrTail, this.redactor.redact(data));
            },
            persistSession: this.options.persistSession ?? true,
            ...(this.options.sessionStore === undefined ? {} : { sessionStore: this.options.sessionStore }),
            ...(this.options.sessionStoreFlush === undefined ? {} : { sessionStoreFlush: this.options.sessionStoreFlush }),
            includePartialMessages: true,
            forwardSubagentText: true,
            enableFileCheckpointing: true,
            ...(this.options.permissionMode === 'bypassPermissions' ? { allowDangerouslySkipPermissions: true } : {}),
            settingSources: [],
            canUseTool,
            onUserDialog,
            supportedDialogKinds: [...supportedDialogKinds],
            ...(this.options.model === undefined ? {} : { model: this.options.model }),
            ...(this.options.effort === undefined ? {} : { effort: this.options.effort }),
            ...(this.options.thinking === undefined ? {} : { thinking: this.options.thinking }),
            ...(this.options.permissionMode === undefined ? {} : { permissionMode: this.options.permissionMode }),
            ...(this.options.executablePath === undefined ? {} : { pathToClaudeCodeExecutable: this.options.executablePath }),
            spawnClaudeCodeProcess: (spawnOptions) => ClaudeProcess.start({
                ...spawnOptions,
                command: this.options.executablePath ?? spawnOptions.command,
                args: [...this.options.commandArgs ?? spawnOptions.args],
                redactions: claudeProcessRedactions(this.options),
            }),
            ...(additionalDirectories === undefined ? {} : { additionalDirectories: [...additionalDirectories] }),
            ...(mcpServers === undefined ? {} : { mcpServers: { ...mcpServers } }),
            ...(plugins === undefined ? {} : { plugins: [...plugins] }),
            ...(this.userAgentDefinitions === undefined ? {} : { agents: { ...this.userAgentDefinitions } }),
            ...(this.options.resumeSessionId !== undefined && this.options.forkSession !== true ? {} : { sessionId: this.nativeSessionId }),
            ...(this.options.resumeSessionId === undefined ? {} : { resume: this.options.resumeSessionId }),
            ...(this.options.forkSession === undefined ? {} : { forkSession: this.options.forkSession }),
        };
    }
    async requestPermission(toolName, input, options) {
        const permissionMode = this.modeState.current ?? 'default';
        const controlRequest = toolName === 'AskUserQuestion'
            ? toAskUserQuestion(toolName, input, options, permissionMode)
            : toPermissionRequest(toolName, input, options, permissionMode);
        const request = claudePermissionRequest(controlRequest, options.signal);
        if (this.options.permissionHandler) {
            this.emit({ type: 'permission_requested', request });
            try {
                const decision = permissionDecisionForSdk(await this.options.permissionHandler(request));
                this.emit({ type: 'permission_resolved', requestId: request.requestId, decision: claudePermissionDecision(decision) });
                return decision;
            }
            catch (error) {
                throw this.redactor.redactError(error);
            }
        }
        if (this.options.defaultPermission !== undefined) {
            this.emit({ type: 'permission_requested', request });
            const decision = this.options.defaultPermission;
            this.emit({ type: 'permission_resolved', requestId: request.requestId, decision: claudePermissionDecision(decision) });
            return decision;
        }
        const responsePromise = this.permissionRegistry.begin(controlRequest, {
            signal: options.signal,
        });
        this.emit({ type: 'permission_requested', request });
        try {
            const response = await responsePromise;
            return toSdkPermissionResult(response);
        }
        catch (error) {
            if (error instanceof ControlError && (error.code === 'timeout' || error.code === 'canceled')) {
                const decision = { behavior: 'deny', message: error.message, interrupt: error.code === 'canceled', ...(request.toolUseId === undefined ? {} : { toolUseID: request.toolUseId }) };
                this.emit({ type: 'permission_resolved', requestId: request.requestId, decision });
                return permissionDecisionForSdk(decision);
            }
            throw this.redactor.redactError(error);
        }
    }
    async requestUserQuestion(request, options) {
        const requestId = options.requestId.length > 0 ? options.requestId : randomUUID();
        const dialog = toUserDialogRequest(request, requestId);
        const normalized = {
            requestId: dialog.requestId,
            dialogKind: dialog.dialogKind,
            payload: dialog.payload,
            ...(dialog.toolUseId === undefined ? {} : { toolUseId: dialog.toolUseId }),
            signal: options.signal,
        };
        this.emit({ type: 'user_question_requested', request: normalized });
        let resolve;
        const promise = new Promise(resolveResult => { resolve = resolveResult; });
        const abortListener = () => this.finishUserQuestion(normalized.requestId, { behavior: 'cancelled' });
        const timer = this.options.userQuestionTimeoutMs === undefined
            ? undefined
            : setTimeout(() => this.finishUserQuestion(normalized.requestId, { behavior: 'cancelled' }), Math.max(0, this.options.userQuestionTimeoutMs));
        const pending = { request: normalized, resolve, timer, abortListener };
        this.pendingQuestionsMap.set(normalized.requestId, pending);
        options.signal.addEventListener('abort', abortListener, { once: true });
        return promise;
    }
    finishUserQuestion(requestId, result) {
        const pending = this.pendingQuestionsMap.get(requestId);
        if (pending === undefined)
            return;
        this.pendingQuestionsMap.delete(requestId);
        if (pending.timer !== undefined)
            clearTimeout(pending.timer);
        if (pending.abortListener !== undefined)
            pending.request.signal.removeEventListener('abort', pending.abortListener);
        pending.resolve(result);
        this.emit({ type: 'user_question_resolved', requestId, result });
    }
    transportQuery() { return this.transport.query; }
    handleTransportEvent(event) {
        try {
            if (event.type === 'ended') {
                const error = event.error === undefined ? undefined : this.redactor.redactError(event.error);
                const turn = this.activeTurn;
                if (turn) {
                    const failure = error ?? new Error('Claude process exited before the active turn completed');
                    const diagnostic = this.stderrTail.trim();
                    const message = diagnostic.length === 0 ? failure.message : `${failure.message} (Claude stderr: ${diagnostic})`;
                    const turnError = this.redactor.redactError(new Error(message));
                    turn.reject?.(turnError);
                    this.emit({ type: 'turn_failed', turnId: turn.id, error: turnError.message });
                    this.activeTurn = undefined;
                }
                if (this.readyPromise !== undefined && !this.readySettled) {
                    void this.failInitialization(error ?? new Error('Claude process ended before initialization completed'));
                }
                if (!this.closed)
                    this.emit({ type: 'process_exited', ...(error === undefined ? {} : { error: error.message }) });
                return;
            }
            this.handleMessage(event.message);
        }
        catch (error) {
            const redacted = this.redactor.redactError(error);
            const turn = this.activeTurn;
            if (turn) {
                turn.reject?.(redacted);
                this.emit({ type: 'turn_failed', turnId: turn.id, error: redacted.message });
                this.activeTurn = undefined;
            }
            if (this.readyPromise !== undefined && !this.readySettled)
                void this.failInitialization(redacted);
            if (!this.closed)
                this.emit({ type: 'process_exited', error: redacted.message });
        }
    }
    handleMessage(raw) {
        const message = asRecord(raw) ?? {};
        switch (stringValue(message['type'])) {
            case 'system':
                this.handleSystem(message);
                break;
            case 'stream_event':
                this.handleStreamEvent(message);
                break;
            case 'assistant':
                this.handleAssistant(message);
                break;
            case 'user':
                this.handleUser(message);
                break;
            case 'result':
                this.handleResult(message);
                break;
            case 'tool_progress':
                this.emit({ type: 'status_changed', status: 'tool_progress', metadata: this.redactor.redactValue(message) });
                break;
            case 'task_started':
            case 'task_progress':
            case 'task_notification':
            case 'task_updated':
            case 'task_result':
            case 'task_failure':
            case 'task_cancel':
                this.handleSubagentMessage(message);
                break;
            case 'background_tasks_changed':
                this.emit({ type: 'status_changed', status: 'background_tasks_changed', metadata: this.redactor.redactValue(message) });
                break;
            case 'rate_limit_event':
            case 'status':
            case 'notification':
                this.emit({ type: 'status_changed', status: String(message['type']), metadata: this.redactor.redactValue(message) });
                break;
            default: break;
        }
    }
    handleSubagentMessage(message) {
        const observations = this.subagentReducer.reduce(message);
        for (const observation of observations) {
            this.emit({ type: 'provider_subagent', event: observation });
            const text = observation.description ?? observation.summary ?? observation.error ?? (observation.result === undefined ? undefined : serialize(observation.result));
            const item = {
                type: 'subagent',
                id: observation.id,
                ...(text === undefined ? {} : { text }),
                metadata: { kind: observation.kind, ...(observation.status === undefined ? {} : { status: observation.status }) },
            };
            this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item });
        }
    }
    handleSystem(message) {
        const subtype = stringValue(message['subtype']);
        if (subtype === 'task_started' || subtype === 'task_progress' || subtype === 'task_notification' || subtype === 'task_updated' || subtype === 'task_result' || subtype === 'task_failure' || subtype === 'task_cancel') {
            this.handleSubagentMessage(message);
            return;
        }
        if (subtype === 'background_tasks_changed') {
            this.emit({ type: 'status_changed', status: 'background_tasks_changed', metadata: this.redactor.redactValue(message) });
            return;
        }
        if (subtype === 'init') {
            this.applyInitialization(message);
            this.emitSessionStarted();
        }
        else if (subtype === 'compact_boundary') {
            this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'compaction', text: this.redactor.redact(stringValue(message['compact_metadata']) ?? ''), metadata: this.redactor.redactValue(message) } });
        }
        else
            this.emit({ type: 'status_changed', status: subtype ?? 'system', metadata: this.redactor.redactValue(message) });
    }
    emitSessionStarted() {
        if (this.sessionStartedEmitted || this._sessionId === undefined)
            return;
        this.sessionStartedEmitted = true;
        this.emit({ type: 'session_started', sessionId: this._sessionId, catalog: this._catalog });
    }
    applyInitialization(message) {
        const currentModel = stringValue(message['model']);
        assertClaudeModelAllowed(currentModel);
        const models = Array.isArray(message['models'])
            ? filterClaudeCatalogModels(message['models']).map((value) => this.mapModel(value))
            : this._catalog.models;
        const commands = Array.isArray(message['slash_commands']) ? message['slash_commands'].map((value) => ({ name: String(value) })) : this._catalog.commands;
        const skills = Array.isArray(message['skills']) ? message['skills'].map((value) => ({ name: String(value) })) : this._catalog.skills;
        const mcpServers = Array.isArray(message['mcp_servers']) ? message['mcp_servers'].map((value) => this.mapMcp(value)) : this._catalog.mcpServers;
        const modes = stringValue(message['permissionMode']) ? [{ id: String(message['permissionMode']), label: String(message['permissionMode']) }] : this._catalog.modes;
        this._catalog = {
            ...this._catalog,
            ...(currentModel === undefined ? {} : { model: currentModel }),
            models, commands, skills, mcpServers, modes,
            capabilities: Array.isArray(message['capabilities']) ? message['capabilities'].map(String) : this._catalog.capabilities,
            permissionMode: stringValue(message['permissionMode']) ?? this._catalog.permissionMode,
            effort: stringValue(message['effort']) ?? this._catalog.effort,
        };
    }
    handleStreamEvent(message) {
        const event = asRecord(message['event']);
        const eventType = stringValue(event?.['type']);
        const index = String(event?.['index'] ?? '');
        if (eventType === 'content_block_start') {
            const block = asRecord(event?.['content_block']);
            if (stringValue(block?.['type']) === 'tool_use') {
                const id = stringValue(block?.['id']);
                const name = stringValue(block?.['name']);
                if (id && name)
                    this.toolMetaByIndex.set(index, { id, name });
            }
            return;
        }
        if (eventType === 'content_block_stop') {
            const meta = this.toolMetaByIndex.get(index);
            if (meta)
                this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'tool_call', id: meta.id, name: meta.name, arguments: this.toolInputByIndex.get(index) ?? '{}', partial: false } });
            return;
        }
        const delta = asRecord(event?.['delta']);
        if (eventType !== 'content_block_delta' || !delta)
            return;
        const deltaType = stringValue(delta['type']);
        if (deltaType === 'text_delta' && stringValue(delta['text'])) {
            const text = String(delta['text']);
            if (this.activeTurn)
                this.activeTurn.finalText += text;
            this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'assistant_message', text, partial: true } });
        }
        else if (deltaType === 'thinking_delta' && stringValue(delta['thinking'])) {
            this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'reasoning', text: String(delta['thinking']), partial: true } });
        }
        else if (deltaType === 'input_json_delta') {
            const next = (this.toolInputByIndex.get(index) ?? '') + (stringValue(delta['partial_json']) ?? '');
            this.toolInputByIndex.set(index, next);
            const meta = this.toolMetaByIndex.get(index);
            this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'tool_call', id: meta?.id ?? index, name: meta?.name, arguments: next, partial: true } });
        }
    }
    handleAssistant(message) {
        const content = asRecord(message['message'])?.['content'];
        if (!Array.isArray(content))
            return;
        for (const rawBlock of content) {
            const block = asRecord(rawBlock);
            if (!block)
                continue;
            switch (stringValue(block['type'])) {
                case 'text': {
                    const text = stringValue(block['text']) ?? '';
                    if (!text)
                        break;
                    if (this.activeTurn && !this.activeTurn.finalText.endsWith(text))
                        this.activeTurn.finalText = text.startsWith(this.activeTurn.finalText) ? text : `${this.activeTurn.finalText}${text}`;
                    this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'assistant_message', text } });
                    break;
                }
                case 'thinking':
                case 'redacted_thinking':
                    this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'reasoning', text: stringValue(block['thinking']) ?? '', metadata: block } });
                    break;
                case 'tool_use': {
                    const id = stringValue(block['id']) ?? randomUUID();
                    this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'tool_call', id, name: stringValue(block['name']), arguments: serialize(block['input']), parentToolUseId: stringValue(message['parent_tool_use_id']) ?? null } });
                    break;
                }
            }
        }
    }
    handleUser(message) {
        const content = asRecord(message['message'])?.['content'];
        if (!Array.isArray(content))
            return;
        for (const rawBlock of content) {
            const block = asRecord(rawBlock);
            if (block?.['type'] !== 'tool_result')
                continue;
            this.emit({ type: 'timeline', turnId: this.activeTurn?.id, item: { type: 'tool_result', id: stringValue(block['tool_use_id']), output: contentText(block['content']), isError: boolValue(block['is_error']) ?? false } });
        }
    }
    handleResult(message) {
        const isError = boolValue(message['is_error']) === true || stringValue(message['subtype'])?.startsWith('error');
        const turn = this.activeTurn;
        if (turn === undefined)
            return;
        const usage = usageOf(message['usage'], message);
        if (usage)
            this.emit({ type: 'usage_updated', turnId: turn.id, usage });
        if (isError) {
            const messageText = stringValue(message['result']) ?? (message['errors'] === undefined ? undefined : serialize(message['errors'])) ?? 'Claude turn failed';
            const diagnostic = this.stderrTail.trim();
            const errorMessage = diagnostic.length === 0 ? messageText : `${messageText} (Claude stderr: ${diagnostic})`;
            const error = this.redactor.redactError(new Error(errorMessage));
            this.emit({ type: 'turn_failed', turnId: turn.id, error: error.message });
            turn.reject?.(error);
        }
        else {
            const result = stringValue(message['result']);
            this.emit({ type: 'turn_completed', turnId: turn.id, usage, result });
            turn.resolve?.({ sessionId: this._sessionId, turnId: turn.id, finalText: turn.finalText || result || '', usage });
        }
        this.activeTurn = undefined;
    }
    emit(event) {
        const safeEvent = this.redactor.redactValue(event);
        for (const listener of [...this.listeners])
            listener(safeEvent);
    }
    mapCatalogCommand(value) {
        return {
            name: value.name,
            description: value.description,
            argumentHint: value.argumentHint,
            source: 'sdk',
        };
    }
    mapCatalogModel(value) {
        return {
            id: value.value,
            label: value.displayName,
            description: value.description,
        };
    }
    mapCommand(value) {
        const item = asRecord(value) ?? {};
        return { name: stringValue(item['name']) ?? String(value), ...(stringValue(item['description']) === undefined ? {} : { description: String(item['description']) }), ...(stringValue(item['argumentHint']) === undefined ? {} : { argumentHint: String(item['argumentHint']) }), ...(stringValue(item['source']) === undefined ? {} : { source: String(item['source']) }) };
    }
    mapModel(value) {
        const item = asRecord(value) ?? {};
        return { id: stringValue(item['id']) ?? stringValue(item['name']) ?? String(value), ...(stringValue(item['displayName']) === undefined ? {} : { label: String(item['displayName']) }), ...(stringValue(item['description']) === undefined ? {} : { description: String(item['description']) }), ...(numberValue(item['contextWindow']) === undefined ? {} : { contextWindow: Number(item['contextWindow']) }) };
    }
    mapMcp(value) {
        const item = asRecord(value) ?? {};
        return { name: stringValue(item['name']) ?? 'unknown', status: stringValue(item['status']) ?? 'unknown' };
    }
}
//# sourceMappingURL=session.js.map