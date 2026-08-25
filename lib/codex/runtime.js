import { JsonRpcLineTransport as LineTransport } from './json-rpc.js';
import { CodexProcess } from './process.js';
function object(value, label) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function string(value, label) {
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`${label} must be a non-empty string`);
    return value;
}
function threadFrom(value) {
    const root = object(value, 'thread response');
    const thread = object(root['thread'], 'thread response.thread');
    return {
        id: string(thread['id'], 'thread id'),
        ...thread['ephemeral'] === undefined
            ? {}
            : { ephemeral: thread['ephemeral'] },
    };
}
function turnFrom(value) {
    const root = object(value, 'turn response');
    const turn = object(root['turn'], 'turn response.turn');
    return { id: string(turn['id'], 'turn id') };
}
/** Codex app-server lifecycle for one Harness Agent. */
export class CodexRuntime {
    options;
    process;
    transport;
    thread;
    turn;
    closed = false;
    constructor(process, transport, options) {
        this.options = options;
        this.process = process;
        this.transport = transport;
    }
    static async open(options) {
        const process = CodexProcess.start(options);
        const transport = new LineTransport(process.child.stdout, process.child.stdin);
        transport.start();
        const runtime = new CodexRuntime(process, transport, options);
        try {
            await runtime.initialize();
            return runtime;
        }
        catch (error) {
            transport.close(error instanceof Error ? error : new Error(String(error)));
            await process.dispose();
            throw error;
        }
    }
    get threadId() {
        return this.thread?.id;
    }
    get turnId() {
        return this.turn?.id;
    }
    async initialize(signal) {
        await this.transport.request('initialize', {
            clientInfo: {
                name: 'dsh-engine-suite',
                title: 'DeepSeek Harness Engine Suite',
                version: '0.1.0',
            },
            capabilities: {
                experimentalApi: false,
                requestAttestation: false,
            },
        }, signal);
        await this.transport.notify('initialized');
    }
    async listModels(options = {}, signal) {
        const response = await this.transport.request('model/list', {
            includeHidden: options.includeHidden ?? true,
            ...options.limit === undefined ? {} : { limit: options.limit },
        }, signal);
        const root = object(response, 'model/list response');
        const data = root['data'];
        if (!Array.isArray(data))
            throw new Error('model/list response.data must be an array');
        return data.map((entry, index) => object(entry, `model/list response.data[${index}]`));
    }
    async startThread(signal) {
        const response = await this.transport.request('thread/start', {
            cwd: this.options.cwd,
            ephemeral: this.options.ephemeral ?? false,
            ...this.options.model === undefined ? {} : { model: this.options.model },
            ...this.options.modelProvider === undefined ? {} : { modelProvider: this.options.modelProvider },
            ...this.options.baseInstructions === undefined ? {} : { baseInstructions: this.options.baseInstructions },
            ...this.options.approvalPolicy === undefined ? {} : { approvalPolicy: this.options.approvalPolicy },
            ...this.options.sandbox === undefined ? {} : { sandbox: this.options.sandbox },
        }, signal);
        this.thread = threadFrom(response);
        return this.thread;
    }
    async resumeThread(threadId, signal) {
        if (threadId.trim() === '')
            throw new Error('thread id must not be empty');
        const response = await this.transport.request('thread/resume', { threadId }, signal);
        this.thread = threadFrom(response);
        return this.thread;
    }
    async startTurn(text, signal) {
        if (this.thread === undefined)
            throw new Error('cannot start a turn before a thread exists');
        if (text.trim() === '')
            throw new Error('turn text must not be empty');
        const response = await this.transport.request('turn/start', {
            threadId: this.thread.id,
            input: [{ type: 'text', text, text_elements: [] }],
            ...this.options.model === undefined ? {} : { model: this.options.model },
            ...this.options.reasoningEffort === undefined ? {} : { effort: this.options.reasoningEffort },
        }, signal);
        this.turn = turnFrom(response);
        return this.turn;
    }
    async steer(text, signal) {
        if (this.thread === undefined || this.turn === undefined)
            throw new Error('cannot steer without an active thread and turn');
        if (text.trim() === '')
            throw new Error('steering text must not be empty');
        return this.transport.request('turn/steer', {
            threadId: this.thread.id,
            expectedTurnId: this.turn.id,
            input: [{ type: 'text', text, text_elements: [] }],
        }, signal);
    }
    async interrupt(signal) {
        if (this.thread === undefined || this.turn === undefined)
            return null;
        return this.transport.request('turn/interrupt', {
            threadId: this.thread.id,
            turnId: this.turn.id,
        }, signal);
    }
    async close() {
        if (this.closed)
            return this.process.exited;
        this.closed = true;
        this.transport.close();
        return this.process.dispose();
    }
}
//# sourceMappingURL=runtime.js.map