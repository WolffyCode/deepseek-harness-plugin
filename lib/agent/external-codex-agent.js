import { agentEvents, Inbox, } from '@deepseek-ai/dsh-agent';
import { createScope } from '@deepseek-ai/dsh-scope';
import { createAssistantMessage } from '@deepseek-ai/dsh-llm';
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}
function object(value, label) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function textFromMessage(message) {
    return message.content
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim();
}
function failure(message, code = 'CODEX_RUNTIME') {
    return { message, code };
}
/**
 * Minimal external Agent implementation for one Codex runtime.
 *
 * Codex owns planning and tool execution. Harness owns Agent identity, inbox,
 * lifecycle events, Session persistence, and the visible assistant transcript.
 */
export class ExternalCodexAgent {
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
        if (this.phase.kind === 'running') {
            this.phase.wakeRequested = false;
            this.phase.abort.abort(cause);
            void this.runtime.interrupt().catch(() => { });
        }
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
        };
        this.phase = phase;
        const done = deferred();
        this.activityDone = done.promise;
        this.loopCtx.agents.withInitiator(this, () => this.drive(phase)).then(done.resolve, done.resolve);
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
                        throw new Error('Codex Agent received an empty text task');
                    await this.runtime.startTurn(prompt, phase.abort.signal);
                    const result = await this.waitTurn(phase.abort.signal, turn, step);
                    if (result.text.length > 0) {
                        this.session.append('assistant/message', {
                            turn,
                            step,
                            message: createAssistantMessage({
                                content: [{ type: 'text', text: result.text }],
                                source: { provider: this.provider, model: this.model },
                            }),
                        }, { surfaceOp: 'append', sourceEventSeqs: result.chunkSeqs });
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
        const unsubscribe = this.runtime.transport.onNotification((method, params) => {
            const fields = object(params, `Codex ${method} params`);
            const eventTurn = fields['turnId'];
            const runtimeTurn = this.runtime.turnId;
            if (runtimeTurn !== undefined && typeof eventTurn === 'string' && eventTurn !== runtimeTurn)
                return;
            if (method === 'item/agentMessage/delta') {
                const delta = fields['delta'];
                if (typeof delta !== 'string' || delta.length === 0)
                    return;
                text += delta;
                chunkSeqs.push(this.session.append('assistant/chunk', {
                    turn,
                    step,
                    chunk: { type: 'text-delta', index: 0, text: delta },
                }).seq);
                return;
            }
            if (method !== 'turn/completed')
                return;
            const turnValue = object(fields['turn'], 'Codex turn/completed.turn');
            const status = turnValue['status'];
            if (status === 'failed') {
                const errorValue = turnValue['error'];
                const message = typeof errorValue === 'string' ? errorValue : 'Codex turn failed';
                result.reject(new Error(message));
            }
            else {
                result.resolve({ text, chunkSeqs });
            }
            unsubscribe();
        });
        const onAbort = () => {
            unsubscribe();
            result.reject(signal.reason instanceof Error ? signal.reason : new Error('Codex Agent turn aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        void this.runtime.process.exited.then(() => {
            unsubscribe();
            if (!signal.aborted)
                result.reject(new Error(`Codex process exited: ${this.runtime.process.stderrTail}`.trim()));
        });
        return result.promise.finally(() => signal.removeEventListener('abort', onAbort));
    }
}
//# sourceMappingURL=external-codex-agent.js.map