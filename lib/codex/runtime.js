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
function stringField(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function serialized(value) {
    if (typeof value === 'string')
        return value;
    if (value === undefined)
        return '';
    return JSON.stringify(value);
}
function toolCallFromItem(item) {
    const id = stringField(item['id']);
    if (id === undefined)
        return undefined;
    const type = stringField(item['type']);
    if (type === 'commandExecution') {
        return { id, name: 'command_execution', arguments: JSON.stringify({ command: item['command'] ?? '' }) };
    }
    if (type === 'fileChange') {
        return { id, name: 'file_change', arguments: JSON.stringify({ changes: item['changes'] ?? item['patch'] ?? [] }) };
    }
    if (type === 'mcpToolCall') {
        return {
            id,
            name: stringField(item['tool']) ?? 'mcp_tool',
            arguments: serialized(item['arguments'] ?? item['input'] ?? {}),
        };
    }
    if (type === 'webSearch') {
        return { id, name: 'web_search', arguments: serialized(item['query'] ?? item['input'] ?? {}) };
    }
    if (type === 'computerCall' || type === 'computer_call') {
        return { id, name: 'computer', arguments: serialized(item['action'] ?? item['input'] ?? item) };
    }
    return undefined;
}
function toolResultFromItem(item) {
    const id = stringField(item['id']);
    if (id === undefined)
        return undefined;
    const status = stringField(item['status']);
    const isError = status === 'failed' || status === 'declined' || status === 'error' || item['isError'] === true;
    const output = item['aggregatedOutput'] ?? item['output'] ?? item['stdout'] ?? item['stderr'] ?? item['result'] ?? item['changes'] ?? item['patch'];
    return { id, output: serialized(output ?? item), isError };
}
function defaultServerRequestHandler(method) {
    switch (method) {
        case 'item/commandExecution/requestApproval':
        case 'item/fileChange/requestApproval':
            return { decision: 'decline' };
        case 'item/permissions/requestApproval':
            return { permissions: {}, scope: 'turn' };
        case 'item/tool/requestUserInput':
            return { answers: {} };
        case 'mcpServer/elicitation/request':
            return { action: 'decline', content: null, _meta: null };
        default:
            throw new Error(`unsupported Codex app-server request: ${method}`);
    }
}
/** Codex app-server lifecycle for one Harness Agent. */
export class CodexRuntime {
    options;
    process;
    transport;
    thread;
    turn;
    closed = false;
    eventListeners = new Set();
    constructor(process, transport, options) {
        this.options = options;
        this.process = process;
        this.transport = transport;
        this.transport.onRequest(options.serverRequestHandler ?? defaultServerRequestHandler);
        this.transport.onNotification((method, params) => this.handleNotification(method, params));
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
    onEvent(handler) {
        this.eventListeners.add(handler);
        return () => this.eventListeners.delete(handler);
    }
    emit(event) {
        for (const listener of [...this.eventListeners])
            listener(event);
    }
    handleNotification(method, rawParams) {
        const params = typeof rawParams === 'object' && rawParams !== null && !Array.isArray(rawParams)
            ? rawParams
            : undefined;
        const eventTurnId = stringField(params?.['turnId']);
        if (method === 'item/agentMessage/delta') {
            const delta = stringField(params?.['delta']);
            if (delta !== undefined)
                this.emit({ type: 'text-delta', ...eventTurnId === undefined ? {} : { turnId: eventTurnId }, text: delta });
            return;
        }
        if (method === 'item/started') {
            const item = typeof params?.['item'] === 'object' && params['item'] !== null && !Array.isArray(params['item'])
                ? params['item']
                : undefined;
            if (item === undefined)
                return;
            const tool = toolCallFromItem(item);
            if (tool !== undefined)
                this.emit({ type: 'tool-call', ...eventTurnId === undefined ? {} : { turnId: eventTurnId }, ...tool });
            return;
        }
        if (method === 'item/completed') {
            const item = typeof params?.['item'] === 'object' && params['item'] !== null && !Array.isArray(params['item'])
                ? params['item']
                : undefined;
            if (item === undefined)
                return;
            if (toolCallFromItem(item) === undefined)
                return;
            const result = toolResultFromItem(item);
            if (result !== undefined)
                this.emit({ type: 'tool-result', ...eventTurnId === undefined ? {} : { turnId: eventTurnId }, ...result });
            return;
        }
        if (method === 'turn/completed') {
            const turn = typeof params?.['turn'] === 'object' && params['turn'] !== null && !Array.isArray(params['turn'])
                ? params['turn']
                : undefined;
            const status = stringField(turn?.['status']);
            const error = serialized(turn?.['error']);
            this.emit({
                type: 'turn-completed',
                ...eventTurnId === undefined ? {} : { turnId: eventTurnId },
                status: status === 'completed' ? 'completed' : 'failed',
                ...status === 'completed' || error.length === 0 ? {} : { error },
            });
        }
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