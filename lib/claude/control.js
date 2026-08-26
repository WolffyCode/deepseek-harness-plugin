export class ControlError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ControlError';
        this.code = code;
    }
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSecretKey(key) {
    return /(secret|token|password|passwd|api[-_]?key|auth|credential|private[-_]?key|cookie|authorization)/i.test(key);
}
function cloneValue(value, redact, key = '') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || value instanceof WeakMap || value instanceof WeakSet)
        return undefined;
    if (redact && isSecretKey(key))
        return '[REDACTED]';
    if (value instanceof Date)
        return new Date(value.getTime()).toISOString();
    if (Array.isArray(value))
        return value.map(item => cloneValue(item, redact)).filter((item) => item !== undefined);
    if (isObject(value)) {
        const copy = {};
        for (const [entryKey, entryValue] of Object.entries(value)) {
            if (entryKey === 'signal' || entryKey === 'requestId' || entryKey === 'callback' || entryKey === 'handler' || entryKey === 'onAbort')
                continue;
            const cloned = cloneValue(entryValue, redact, entryKey);
            if (cloned !== undefined)
                copy[entryKey] = cloned;
        }
        return copy;
    }
    return value;
}
function cloneRecord(value, redact) {
    const cloned = cloneValue(value, redact);
    return isObject(cloned) ? cloned : {};
}
function clonePermissionUpdate(update) {
    switch (update.type) {
        case 'addRules':
        case 'replaceRules':
        case 'removeRules':
            return { type: update.type, rules: update.rules.map(rule => ({ toolName: rule.toolName, ...(rule.ruleContent === undefined ? {} : { ruleContent: rule.ruleContent }) })), behavior: update.behavior, destination: update.destination };
        case 'setMode':
            return { type: 'setMode', mode: update.mode, destination: update.destination };
        case 'addDirectories':
        case 'removeDirectories':
            return { type: update.type, directories: [...update.directories], destination: update.destination };
    }
}
function toSdkPermissionUpdate(update) {
    switch (update.type) {
        case 'addRules':
        case 'replaceRules':
        case 'removeRules':
            return { type: update.type, rules: update.rules.map(rule => ({ toolName: rule.toolName, ...(rule.ruleContent === undefined ? {} : { ruleContent: rule.ruleContent }) })), behavior: update.behavior, destination: update.destination };
        case 'setMode':
            return { type: 'setMode', mode: update.mode, destination: update.destination };
        case 'addDirectories':
        case 'removeDirectories':
            return { type: update.type, directories: [...update.directories], destination: update.destination };
    }
}
export function toPermissionRequest(toolName, input, options, permissionMode) {
    return {
        requestId: options.requestId,
        toolName,
        input: cloneRecord(input, true),
        ...(options.suggestions === undefined ? {} : { suggestions: options.suggestions.map(clonePermissionUpdate) }),
        ...(options.blockedPath === undefined ? {} : { blockedPath: options.blockedPath }),
        ...(options.decisionReason === undefined ? {} : { decisionReason: options.decisionReason }),
        ...(options.title === undefined ? {} : { title: options.title }),
        ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
        ...(options.description === undefined ? {} : { description: options.description }),
        ...(options.toolUseID === undefined ? {} : { toolUseId: options.toolUseID }),
        ...(options.agentID === undefined ? {} : { agentId: options.agentID }),
        ...(options.matchedAskRule === undefined ? {} : { matchedAskRule: { source: options.matchedAskRule.source, toolName: options.matchedAskRule.toolName, ...(options.matchedAskRule.ruleContent === undefined ? {} : { ruleContent: options.matchedAskRule.ruleContent }) } }),
        permissionMode,
    };
}
export function toSdkPermissionResult(response) {
    if (response.behavior === 'deny') {
        return {
            behavior: 'deny',
            message: response.message,
            ...(response.interrupt === undefined ? {} : { interrupt: response.interrupt }),
            ...(response.toolUseId === undefined ? {} : { toolUseID: response.toolUseId }),
            ...(response.decisionClassification === undefined ? {} : { decisionClassification: response.decisionClassification }),
        };
    }
    return {
        behavior: 'allow',
        ...(response.updatedInput === undefined ? {} : { updatedInput: cloneRecord(response.updatedInput, false) }),
        ...(response.updatedPermissions === undefined ? {} : { updatedPermissions: response.updatedPermissions.map(toSdkPermissionUpdate) }),
        ...(response.toolUseId === undefined ? {} : { toolUseID: response.toolUseId }),
        ...(response.decisionClassification === undefined ? {} : { decisionClassification: response.decisionClassification }),
    };
}
export function createCanUseToolHandler(callback, options) {
    return async (toolName, input, sdkOptions) => toSdkPermissionResult(await callback(toPermissionRequest(toolName, input, sdkOptions, options.permissionMode)));
}
export function toUserDialogRequest(request, requestId) {
    return { requestId, dialogKind: request.dialogKind, payload: cloneRecord(request.payload, true), ...(request.toolUseID === undefined ? {} : { toolUseId: request.toolUseID }) };
}
export function createOnUserDialogHandler(callback) {
    return async (request, options) => {
        const result = await callback(toUserDialogRequest(request, options.requestId));
        return result;
    };
}
function parseAskQuestions(input) {
    const questions = input['questions'];
    if (!Array.isArray(questions))
        throw new ControlError('invalid_input', 'AskUserQuestion requires questions');
    return questions.map((raw, index) => {
        if (!isObject(raw) || typeof raw['question'] !== 'string' || !Array.isArray(raw['options']))
            throw new ControlError('invalid_input', `Invalid AskUserQuestion item ${index}`);
        const options = raw['options'].map((option, optionIndex) => {
            if (!isObject(option) || typeof option['label'] !== 'string')
                throw new ControlError('invalid_input', `Invalid AskUserQuestion option ${optionIndex}`);
            return { label: option['label'], ...(typeof option['description'] === 'string' ? { description: option['description'] } : {}) };
        });
        return {
            question: raw['question'],
            ...(typeof raw['header'] === 'string' ? { header: raw['header'] } : {}),
            options,
            ...(typeof raw['multiSelect'] === 'boolean' ? { multiSelect: raw['multiSelect'] } : {}),
            ...(typeof raw['allowOther'] === 'boolean' ? { allowOther: raw['allowOther'] } : {}),
        };
    });
}
export function toAskUserQuestion(toolName, input, options, permissionMode = 'default') {
    if (toolName !== 'AskUserQuestion')
        throw new ControlError('invalid_input', 'Expected AskUserQuestion tool');
    const request = toPermissionRequest(toolName, input, options, permissionMode);
    return { ...request, kind: 'ask_user_question', questions: parseAskQuestions(input) };
}
function canonicalQuestionKey(question) {
    return question.question.trim() || question.header?.trim() || question.question;
}
export function applyAskUserAnswers(input, answers) {
    const questions = parseAskQuestions(input);
    const cloned = cloneRecord(input, false);
    cloned['questions'] = questions.map(question => ({ question: question.question, ...(question.header === undefined ? {} : { header: question.header }), options: question.options.map(option => ({ ...option })), ...(question.multiSelect === undefined ? {} : { multiSelect: question.multiSelect }) }));
    const normalized = {};
    for (const question of questions) {
        const answer = answers[canonicalQuestionKey(question)] ?? (question.header === undefined ? undefined : answers[question.header]) ?? answers[question.question];
        if (answer !== undefined)
            normalized[canonicalQuestionKey(question)] = Array.isArray(answer) ? [...answer] : answer;
    }
    cloned['answers'] = normalized;
    return cloned;
}
export function askUserResponseToPermission(request, response) {
    if (response.behavior === 'cancelled')
        return { behavior: 'deny', message: 'User cancelled the question' };
    return { behavior: 'allow', updatedInput: applyAskUserAnswers(request.input, response.answers) };
}
const defaultTimer = { setTimeout: (callback, delayMs) => setTimeout(callback, delayMs), clearTimeout: handle => clearTimeout(handle) };
export class PermissionRegistry {
    clock;
    idFactory;
    timer;
    defaultTimeoutMs;
    entries = new Map();
    states = new Map();
    constructor(options = {}) {
        this.clock = options.clock ?? (() => Date.now());
        this.idFactory = options.id ?? (() => `permission-${this.clock()}-${Math.random().toString(36).slice(2)}`);
        this.timer = options.timer ?? defaultTimer;
        this.defaultTimeoutMs = options.defaultTimeoutMs;
    }
    begin(request, options = {}) {
        if (this.entries.has(request.requestId) || this.states.get(request.requestId) === 'pending')
            throw new ControlError('duplicate', `Request '${request.requestId}' is already pending`);
        if (options.signal?.aborted) {
            const error = new ControlError('canceled', `Request '${request.requestId}' was canceled`);
            this.states.set(request.requestId, 'canceled');
            return Promise.reject(error);
        }
        let resolvePromise;
        let rejectPromise;
        const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
        const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
        const deadline = timeoutMs === undefined ? undefined : this.clock() + timeoutMs;
        const abortListener = options.signal === undefined ? undefined : () => { this.finishError(request.requestId, 'canceled', `Request '${request.requestId}' was canceled`); };
        const timer = timeoutMs === undefined ? undefined : this.timer.setTimeout(() => this.expireEntry(request.requestId), Math.max(0, timeoutMs));
        const entry = {
            request,
            resolve: resolvePromise,
            reject: rejectPromise,
            signal: options.signal,
            abortListener,
            timer,
            deadline,
        };
        if (options.signal !== undefined && abortListener !== undefined) {
            options.signal.addEventListener('abort', abortListener, { once: true });
        }
        this.entries.set(request.requestId, entry);
        this.states.set(request.requestId, 'pending');
        return promise;
    }
    respond(requestId, response) {
        if (!this.entries.has(requestId))
            return { ok: false, error: new ControlError(this.states.has(requestId) ? 'duplicate' : 'unknown', `No pending request '${requestId}'`) };
        this.finishResponse(requestId, response);
        return { ok: true };
    }
    cancel(requestId) {
        if (!this.entries.has(requestId))
            return { ok: false, error: new ControlError(this.states.has(requestId) ? 'duplicate' : 'unknown', `No pending request '${requestId}'`) };
        this.finishError(requestId, 'canceled', `Request '${requestId}' was canceled`);
        return { ok: true };
    }
    cancelAll() {
        const ids = [...this.entries.keys()];
        for (const id of ids)
            this.finishError(id, 'canceled', `Request '${id}' was canceled`);
        return ids;
    }
    expireDue(now = this.clock()) {
        const expired = [];
        for (const [requestId, entry] of this.entries) {
            if (entry.deadline !== undefined && entry.deadline <= now) {
                expired.push(requestId);
                this.finishError(requestId, 'timeout', `Request '${requestId}' timed out`);
            }
        }
        return expired;
    }
    stateOf(requestId) { return this.states.get(requestId) ?? 'unknown'; }
    pending() { return [...this.entries.values()].map(entry => entry.request); }
    expireEntry(requestId) { if (this.entries.has(requestId))
        this.finishError(requestId, 'timeout', `Request '${requestId}' timed out`); }
    cleanup(requestId, entry) {
        this.entries.delete(requestId);
        if (entry.timer !== undefined)
            this.timer.clearTimeout(entry.timer);
        if (entry.signal !== undefined && entry.abortListener !== undefined)
            entry.signal.removeEventListener('abort', entry.abortListener);
    }
    finishResponse(requestId, response) {
        const entry = this.entries.get(requestId);
        if (entry === undefined)
            return;
        this.cleanup(requestId, entry);
        this.states.set(requestId, 'resolved');
        entry.resolve(response);
    }
    finishError(requestId, code, message) {
        const entry = this.entries.get(requestId);
        if (entry === undefined)
            return;
        this.cleanup(requestId, entry);
        this.states.set(requestId, code === 'timeout' ? 'expired' : 'canceled');
        entry.reject(new ControlError(code, message));
    }
}
function freezeClone(value) {
    if (Array.isArray(value)) {
        const copy = value.map(item => freezeClone(item));
        return Object.freeze(copy);
    }
    if (isObject(value)) {
        const copy = {};
        for (const [key, item] of Object.entries(value))
            copy[key] = freezeClone(item);
        return Object.freeze(copy);
    }
    return value;
}
export class NextTurnStateMachine {
    currentValue;
    pendingValue;
    epochValue = 0;
    versionValue = 0;
    idFactory;
    constructor(initial, options = {}) {
        this.currentValue = freezeClone(initial);
        this.idFactory = options.id ?? (() => `turn-${this.versionValue + 1}`);
    }
    get current() { return this.currentValue; }
    get pending() { return this.pendingValue?.value; }
    get epoch() { return this.epochValue; }
    get version() { return this.versionValue; }
    request(value) {
        this.epochValue += 1;
        this.versionValue += 1;
        const request = { id: this.idFactory(), value: freezeClone(value), epoch: this.epochValue, version: this.versionValue };
        this.pendingValue = request;
        return request;
    }
    commit(request) {
        if (this.pendingValue?.id !== request.id || this.pendingValue.version !== request.version)
            return { ok: false, error: new ControlError('stale', 'The next-turn request is stale') };
        this.currentValue = request.value;
        this.pendingValue = undefined;
        return { ok: true };
    }
    rollback(request) {
        if (this.pendingValue?.id !== request.id || this.pendingValue.version !== request.version)
            return { ok: false, error: new ControlError('stale', 'The next-turn request is stale') };
        this.pendingValue = undefined;
        return { ok: true };
    }
    snapshot() {
        return { current: this.currentValue, ...(this.pendingValue === undefined ? {} : { pending: this.pendingValue.value, request: this.pendingValue }), epoch: this.epochValue, version: this.versionValue };
    }
}
//# sourceMappingURL=control.js.map