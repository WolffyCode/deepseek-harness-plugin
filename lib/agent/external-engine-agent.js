import { agentEvents, Inbox, } from '@deepseek-ai/dsh-agent';
import { createScope } from '@deepseek-ai/dsh-scope';
import { CallId, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { normalizeExternalEngineEvent } from './runtime.js';
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}
function textFromMessage(message) {
    return message.content
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim();
}
function failure(message, code = 'EXTERNAL_ENGINE_RUNTIME') {
    return { message, code };
}
function serialized(value) {
    if (typeof value === 'string')
        return value;
    if (value === undefined)
        return '';
    try {
        return JSON.stringify(value) ?? '';
    }
    catch {
        return String(value);
    }
}
function isTerminal(event) {
    return event.type === 'turn_completed' || event.type === 'turn_failed' || event.type === 'turn_canceled' || event.type === 'error';
}
function sessionUsage(usage) {
    return {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        ...(usage.cachedInputTokens === undefined ? {} : { cacheReadTokens: usage.cachedInputTokens }),
        ...(usage.breakdown?.turn?.reasoningTokens === undefined ? {} : { reasoningTokens: usage.breakdown.turn.reasoningTokens }),
        ...(usage.totalCostUsd === undefined ? {} : { totalCostUsd: usage.totalCostUsd }),
        ...(usage.contextWindowMaxTokens === undefined ? {} : { contextWindowMaxTokens: usage.contextWindowMaxTokens }),
        ...(usage.contextWindowUsedTokens === undefined ? {} : { contextWindowUsedTokens: usage.contextWindowUsedTokens }),
        ...(usage.breakdown === undefined ? {} : { breakdown: usage.breakdown }),
    };
}
/**
 * Agent bridge for one local external engine runtime.
 *
 * The selected CLI owns planning and tool execution. Harness owns Agent identity,
 * inbox, lifecycle events, Session persistence, and the visible transcript.
 */
export class ExternalEngineAgent {
    loopCtx;
    id;
    options;
    session;
    runtime;
    provider;
    model;
    inbox;
    ctx;
    scope;
    dispatch;
    phase;
    activityDone = Promise.resolve();
    disposed = false;
    nextTurn;
    constructor(loopCtx, id, options, session, runtime, provider, model) {
        this.loopCtx = loopCtx;
        this.id = id;
        this.options = options;
        this.session = session;
        this.runtime = runtime;
        this.provider = provider;
        this.model = model;
        this.dispatch = agentEvents(loopCtx, this);
        this.inbox = new Inbox(session, {
            inserted: message => this.dispatch.emit('agent/inbox/inserted', { message }),
            discarded: message => this.dispatch.emit('agent/inbox/discarded', { message }),
            claimed: (message, turn) => this.dispatch.emit('agent/inbox/claimed', { message, turn }),
        });
        this.nextTurn = 0;
        for (const event of session.events) {
            if (event.type === 'turn/start')
                this.nextTurn = event.data.turn;
        }
        this.phase = { kind: 'idle', lastTurn: this.nextTurn };
        this.scope = createScope(loopCtx, this);
        this.ctx = this.scope.ctx.extend({ agent: this });
    }
    get status() {
        return this.phase.kind === 'idle' ? 'idle' : 'running';
    }
    /** Replace the idle CLI runtime while preserving the Harness Agent/Session identity. */
    replaceRuntime(runtime, provider, model) {
        if (this.disposed)
            throw new Error(`agent "${this.id}" is disposed`);
        if (this.phase.kind !== 'idle')
            throw new Error(`agent "${this.id}" is busy`);
        this.runtime = runtime;
        this.provider = provider;
        this.model = model;
    }
    send(message, target, wakeup) {
        if (this.disposed)
            throw new Error(`agent "${this.id}" is disposed`);
        const wakingAfterAbort = wakeup && this.phase.kind === 'running' && this.phase.abort.signal.aborted;
        this.inbox.splice(wakingAfterAbort ? 'next-turn' : target, Infinity, 0, [message]);
        if (wakeup)
            this.wake(wakingAfterAbort);
    }
    followup(message) {
        this.send(message, 'next-turn', true);
    }
    steer(message) {
        this.send(message, 'next-step', true);
    }
    inject(message) {
        this.send(message, 'next-step', false);
    }
    cancel(cause, options = {}) {
        if (!options.keepInbox)
            this.inbox.clear();
        if (this.phase.kind !== 'running')
            return;
        this.phase.wakeRequested = false;
        this.phase.abort.abort(cause);
        if (this.phase.interruptRequested)
            return;
        this.phase.interruptRequested = true;
        void this.runtime.interrupt().catch(() => { });
    }
    whenIdle() {
        return this.activityDone;
    }
    runMaintenance(job) {
        if (this.phase.kind !== 'idle')
            throw new Error(`agent "${this.id}" already has active work`);
        const abort = new AbortController();
        const done = deferred();
        this.activityDone = done.promise;
        return (async () => {
            try {
                return await job(abort.signal);
            }
            finally {
                done.resolve();
            }
        })();
    }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.cancel({ kind: 'disposed' });
        await this.whenIdle();
        await this.runtime.close();
        await this.scope.dispose();
    }
    wake(wakeAfterAbort) {
        if (this.phase.kind === 'running') {
            if (wakeAfterAbort)
                this.phase.wakeRequested = true;
            return;
        }
        const phase = {
            kind: 'running',
            abort: new AbortController(),
            turn: this.nextTurn,
            wakeRequested: false,
            interruptRequested: false,
        };
        this.phase = phase;
        const done = deferred();
        this.activityDone = done.promise;
        const agents = this.loopCtx.get('agents');
        if (agents === undefined) {
            this.phase = { kind: 'idle', lastTurn: this.nextTurn };
            done.resolve();
            return;
        }
        agents.withInitiator(this, () => this.drive(phase)).then(done.resolve, done.resolve);
    }
    async drive(phase) {
        try {
            while (!phase.abort.signal.aborted && this.inbox.hasPending) {
                const messages = this.inbox.claim('next-turn', phase.turn + 1);
                if (messages.length === 0)
                    break;
                const turn = ++this.nextTurn;
                phase.turn = turn;
                this.session.append('turn/start', { turn });
                const step = 1;
                this.session.append('step/start', { turn, step });
                let turnReason = { kind: 'completed' };
                try {
                    for (const message of messages)
                        this.session.append('user/message', message, { surfaceOp: 'append' });
                    const prompt = messages.map(textFromMessage).filter(Boolean).join('\n\n');
                    if (prompt.length === 0)
                        throw new Error('External Engine Agent received an empty text task');
                    // The listener is installed before startTurn. A provider may emit its
                    // turn id and deltas before the start request resolves, so startTurn
                    // and stream completion must be observed independently.
                    const pendingTurn = this.waitTurn(phase.abort.signal, turn, step);
                    void this.runtime.startTurn(prompt, phase.abort.signal).then(started => pendingTurn.bindRuntimeTurn(started.id), error => pendingTurn.fail(error instanceof Error ? error : new Error(String(error))));
                    const result = await pendingTurn.promise;
                    if (result.canceled) {
                        turnReason = { kind: 'aborted', reason: (result.reason ?? 'external engine turn canceled') };
                        phase.abort.abort(result.reason ?? 'external engine turn canceled');
                    }
                }
                catch (error) {
                    if (phase.abort.signal.aborted) {
                        turnReason = { kind: 'aborted', reason: phase.abort.signal.reason };
                    }
                    else {
                        turnReason = { kind: 'error', error: failure(error instanceof Error ? error.message : String(error)) };
                        this.dispatch.emit('agent/error', { turn, step, error });
                    }
                }
                finally {
                    this.session.append('step/end', { turn, step });
                    this.session.append('turn/end', { turn, reason: turnReason });
                }
                if (phase.abort.signal.aborted)
                    break;
                phase.turn = turn;
            }
        }
        finally {
            if (this.phase === phase) {
                this.phase = { kind: 'idle', lastTurn: this.nextTurn };
                if (phase.wakeRequested && this.inbox.hasPending && !this.disposed)
                    this.wake(false);
            }
        }
    }
    waitTurn(signal, turn, step) {
        const result = deferred();
        let text = '';
        const chunkSeqs = [];
        const sourceChunkSeqs = [];
        const assistantParts = [];
        const toolCalls = new Map();
        const completedToolCalls = new Set();
        let nextToolIndex = 2;
        let usage;
        let expectedRuntimeTurnId;
        const bufferedEvents = [];
        let settled = false;
        let unsubscribe = () => { };
        const appendAssistantPart = (type, value) => {
            if (value.length === 0)
                return;
            const previous = assistantParts.at(-1);
            if (previous?.type === type)
                previous.text += value;
            else
                assistantParts.push({ type, text: value });
        };
        const appendText = (value, partial) => {
            if (value.length === 0)
                return;
            const delta = partial
                ? value
                : value === text
                    ? ''
                    : value.startsWith(text)
                        ? value.slice(text.length)
                        : text.endsWith(value)
                            ? ''
                            : value;
            if (delta.length === 0)
                return;
            text += delta;
            appendAssistantPart('text', delta);
            const seq = this.session.append('assistant/chunk', {
                turn,
                step,
                chunk: { type: 'text-delta', index: 0, text: delta },
            }).seq;
            chunkSeqs.push(seq);
            sourceChunkSeqs.push(seq);
        };
        const appendReasoning = (value) => {
            if (value.length === 0)
                return;
            appendAssistantPart('reasoning', value);
            const seq = this.session.append('assistant/chunk', {
                turn,
                step,
                chunk: { type: 'reasoning-delta', index: 1, text: value },
            }).seq;
            chunkSeqs.push(seq);
            sourceChunkSeqs.push(seq);
        };
        const appendUsage = (nextUsage) => {
            usage = nextUsage;
            chunkSeqs.push(this.session.append('assistant/chunk', {
                turn,
                step,
                chunk: { type: 'usage', usage: sessionUsage(nextUsage) },
            }).seq);
        };
        const appendToolArguments = (call, nextArguments) => {
            if (nextArguments === call.argumentsText)
                return;
            if (!nextArguments.startsWith(call.argumentsText)) {
                call.argumentsText = nextArguments;
                return;
            }
            const argumentsDelta = nextArguments.slice(call.argumentsText.length);
            call.argumentsText = nextArguments;
            if (argumentsDelta.length === 0)
                return;
            chunkSeqs.push(this.session.append('assistant/chunk', {
                turn,
                step,
                chunk: {
                    type: 'tool-call-delta',
                    index: call.index,
                    id: call.callId,
                    ...(call.name === 'external_tool' ? {} : { name: call.name }),
                    argumentsDelta,
                },
            }).seq);
        };
        const appendToolCall = (item) => {
            const rawId = item.id.length > 0 ? item.id : `${turn}-${step}-${nextToolIndex}`;
            if (completedToolCalls.has(rawId))
                return;
            const argumentsText = serialized(item.input);
            const existing = toolCalls.get(rawId);
            if (existing !== undefined) {
                appendToolArguments(existing, argumentsText);
                return;
            }
            const callId = CallId(rawId);
            const name = item.name.length > 0 ? item.name : 'external_tool';
            const call = { callId, name, index: nextToolIndex++, argumentsText };
            toolCalls.set(rawId, call);
            this.session.append('assistant/message', {
                turn,
                step,
                message: createAssistantMessage({
                    content: [{ type: 'tool-call', id: callId, name, arguments: argumentsText }],
                    source: { provider: this.provider, model: this.model },
                }),
            }, { surfaceOp: 'append' });
            this.session.append('tool/call', { turn, step, callId, name, arguments: argumentsText });
        };
        const appendToolResult = (item) => {
            const rawId = item.id.length > 0 ? item.id : `${turn}-${step}-${nextToolIndex}`;
            if (completedToolCalls.has(rawId))
                return;
            let call = toolCalls.get(rawId);
            if (call === undefined) {
                const callId = CallId(rawId);
                call = { callId, name: item.name.length > 0 ? item.name : 'external_tool', index: nextToolIndex++, argumentsText: serialized(item.input) };
                toolCalls.set(rawId, call);
                this.session.append('assistant/message', {
                    turn,
                    step,
                    message: createAssistantMessage({
                        content: [{ type: 'tool-call', id: callId, name: call.name, arguments: call.argumentsText }],
                        source: { provider: this.provider, model: this.model },
                    }),
                }, { surfaceOp: 'append' });
                this.session.append('tool/call', { turn, step, callId, name: call.name, arguments: call.argumentsText });
            }
            else {
                appendToolArguments(call, serialized(item.input));
            }
            this.session.append('tool/result', {
                turn,
                step,
                message: createToolResultMessage({
                    callId: call.callId,
                    content: [{ type: 'text', text: serialized(item.output) }],
                    isError: item.status === 'failed' || item.status === 'canceled',
                }),
            }, { surfaceOp: 'append' });
            completedToolCalls.add(rawId);
        };
        const appendAssistantMessage = (interrupted = false) => {
            const content = assistantParts
                .filter(part => part.text.length > 0)
                .map(part => ({ type: part.type, text: part.text }));
            if (content.length === 0)
                return;
            this.session.append('assistant/message', {
                turn,
                step,
                message: createAssistantMessage({
                    content,
                    source: { provider: this.provider, model: this.model },
                }),
                ...(usage === undefined ? {} : { usage: sessionUsage(usage) }),
                ...(interrupted ? { interrupted: true } : {}),
            }, { surfaceOp: 'append', sourceEventSeqs: sourceChunkSeqs });
        };
        const settleCanceled = (reason) => {
            if (settled)
                return;
            appendAssistantMessage(true);
            settled = true;
            unsubscribe();
            result.resolve({ text, ...(usage === undefined ? {} : { usage }), canceled: true, reason });
        };
        const consume = (event) => {
            if (settled)
                return;
            const eventTurnId = 'turnId' in event ? event.turnId : undefined;
            if (expectedRuntimeTurnId !== undefined && eventTurnId !== undefined && eventTurnId !== expectedRuntimeTurnId)
                return;
            if (event.type === 'timeline') {
                const item = event.item;
                if (item.type === 'assistant_message') {
                    appendText(item.text, item.partial === true);
                }
                else if (item.type === 'reasoning') {
                    appendReasoning(item.text);
                }
                else if (item.type === 'tool_call') {
                    if (item.status === 'running')
                        appendToolCall(item);
                    else
                        appendToolResult(item);
                }
                return;
            }
            if (event.type === 'reasoning') {
                appendReasoning(event.text);
                return;
            }
            if (event.type === 'usage_updated') {
                appendUsage(event.usage);
                return;
            }
            if (event.type === 'turn_completed') {
                if (event.result !== undefined)
                    appendText(event.result, false);
                if (event.usage !== undefined)
                    appendUsage(event.usage);
                appendAssistantMessage();
                settled = true;
                unsubscribe();
                result.resolve({ text, ...(usage === undefined ? {} : { usage }) });
                return;
            }
            if (event.type === 'turn_canceled') {
                settleCanceled(event.reason);
                return;
            }
            if (event.type === 'turn_failed' || event.type === 'error') {
                settled = true;
                unsubscribe();
                result.reject(new Error(event.error));
            }
        };
        const flushBuffered = () => {
            const pending = bufferedEvents.splice(0);
            for (const event of pending) {
                if (settled)
                    return;
                const eventTurnId = 'turnId' in event ? event.turnId : undefined;
                if (eventTurnId !== undefined && eventTurnId !== expectedRuntimeTurnId)
                    continue;
                // Before the provider returns its id, an unscoped terminal cannot be
                // proven to belong to this turn; data events remain safe to replay.
                if (eventTurnId === undefined && isTerminal(event))
                    continue;
                consume(event);
            }
        };
        const fail = (error) => {
            if (settled)
                return;
            settled = true;
            unsubscribe();
            result.reject(error);
        };
        unsubscribe = this.runtime.onEvent(rawEvent => {
            const event = normalizeExternalEngineEvent(rawEvent, this.provider);
            if (event === undefined || settled)
                return;
            if (expectedRuntimeTurnId === undefined && 'turnId' in event && event.turnId !== undefined) {
                expectedRuntimeTurnId = event.turnId;
                flushBuffered();
            }
            if (expectedRuntimeTurnId === undefined) {
                bufferedEvents.push(event);
                return;
            }
            consume(event);
        });
        const bindRuntimeTurn = (runtimeTurnId) => {
            if (settled)
                return;
            if (runtimeTurnId.trim() === '') {
                fail(new Error('external engine returned an empty turn id'));
                return;
            }
            if (expectedRuntimeTurnId !== undefined && expectedRuntimeTurnId !== runtimeTurnId) {
                fail(new Error(`external engine returned turn id "${runtimeTurnId}" after streaming "${expectedRuntimeTurnId}"`));
                return;
            }
            expectedRuntimeTurnId = runtimeTurnId;
            flushBuffered();
        };
        const onAbort = () => {
            const reason = signal.reason instanceof Error ? signal.reason.message : 'External engine Agent turn aborted';
            settleCanceled(reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        void this.runtime.process.exited.then(() => {
            if (!signal.aborted)
                fail(new Error(`External engine process exited: ${this.runtime.process.stderrTail}`.trim()));
        });
        return {
            promise: result.promise.finally(() => {
                signal.removeEventListener('abort', onAbort);
                bufferedEvents.length = 0;
            }),
            bindRuntimeTurn,
            fail,
        };
    }
}
//# sourceMappingURL=external-engine-agent.js.map