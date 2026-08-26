import { createInterface } from 'node:readline';
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}
function errorFromUnknown(value) {
    return value instanceof Error ? value : new Error(String(value));
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isJsonRpcId(value) {
    return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value));
}
function frame(value) {
    return `${JSON.stringify(value)}\n`;
}
/** A newline-delimited JSON-RPC 2.0 transport for Codex app-server stdio. */
export class JsonRpcLineTransport {
    input;
    output;
    pending = new Map();
    notificationHandlers = new Set();
    requestHandler;
    closedDeferred = deferred();
    readline;
    nextId = 1;
    closed = false;
    fatalError;
    constructor(input, output) {
        this.input = input;
        this.output = output;
    }
    get closedPromise() {
        return this.closedDeferred.promise;
    }
    start() {
        if (this.readline !== undefined)
            return;
        this.readline = createInterface({ input: this.input, crlfDelay: Infinity });
        this.readline.on('line', line => this.handleLine(line));
        this.readline.on('close', () => this.close(new Error('JSON-RPC input closed')));
        this.input.on('error', error => this.close(errorFromUnknown(error)));
        this.output.on('error', error => this.close(errorFromUnknown(error)));
    }
    onNotification(handler) {
        this.notificationHandlers.add(handler);
        return () => this.notificationHandlers.delete(handler);
    }
    onRequest(handler) {
        if (this.requestHandler !== undefined)
            throw new Error('JSON-RPC request handler is already registered');
        this.requestHandler = handler;
        return () => {
            if (this.requestHandler === handler)
                this.requestHandler = undefined;
        };
    }
    async request(method, params, signal) {
        this.assertOpen();
        if (signal?.aborted)
            throw this.abortError(signal);
        const id = this.nextId++;
        const result = deferred();
        const pending = {
            resolve: result.resolve,
            reject: result.reject,
            ...signal === undefined ? {} : { signal },
        };
        if (signal !== undefined) {
            const onAbort = () => {
                if (this.pending.delete(id))
                    result.reject(this.abortError(signal));
            };
            pending.onAbort = onAbort;
            signal.addEventListener('abort', onAbort, { once: true });
        }
        this.pending.set(id, pending);
        try {
            await this.write({ jsonrpc: '2.0', id, method, ...params === undefined ? {} : { params } });
        }
        catch (error) {
            this.rejectPending(id, errorFromUnknown(error));
        }
        return result.promise;
    }
    async notify(method, params) {
        this.assertOpen();
        await this.write({ jsonrpc: '2.0', method, ...params === undefined ? {} : { params } });
    }
    close(error) {
        if (this.closed)
            return;
        this.closed = true;
        this.fatalError = error;
        this.readline?.close();
        for (const id of this.pending.keys())
            this.rejectPending(id, error ?? new Error('JSON-RPC transport closed'));
        this.closedDeferred.resolve(undefined);
    }
    async write(value) {
        if (this.closed)
            throw this.fatalError ?? new Error('JSON-RPC transport closed');
        const output = frame(value);
        if (this.output.write(output))
            return;
        await new Promise((resolve, reject) => {
            const onDrain = () => {
                this.output.off('error', onError);
                resolve();
            };
            const onError = (error) => {
                this.output.off('drain', onDrain);
                reject(error);
            };
            this.output.once('drain', onDrain);
            this.output.once('error', onError);
        });
    }
    handleLine(line) {
        if (line.trim() === '')
            return;
        let value;
        try {
            value = JSON.parse(line);
        }
        catch (error) {
            this.close(new Error(`invalid JSON-RPC line: ${errorFromUnknown(error).message}`));
            return;
        }
        if (!isObject(value)) {
            this.close(new Error('invalid JSON-RPC message'));
            return;
        }
        // Codex app-server speaks JSON-RPC over stdio but omits the JSON-RPC 2.0
        // marker on responses and notifications. Requests we send retain the
        // marker; the reader accepts both the strict fixture shape and Codex's
        // canonical `{id,result}` / `{method,params}` shape.
        const protocol = value['jsonrpc'];
        if (protocol !== undefined && protocol !== '2.0') {
            this.close(new Error('invalid JSON-RPC version'));
            return;
        }
        if ('method' in value && typeof value['method'] === 'string') {
            if ('id' in value && isJsonRpcId(value['id'])) {
                void this.handleRequest(value['id'], value['method'], value['params']);
            }
            else {
                for (const handler of this.notificationHandlers)
                    handler(value['method'], value['params']);
            }
            return;
        }
        if (!('id' in value) || !isJsonRpcId(value['id'])) {
            this.close(new Error('JSON-RPC response has no valid id'));
            return;
        }
        const response = value;
        if (response.error !== undefined) {
            this.rejectPending(response['id'], new Error(`JSON-RPC ${response.error.code}: ${response.error.message}`));
            return;
        }
        this.resolvePending(response['id'], response['result'] ?? null);
    }
    async handleRequest(id, method, params) {
        if (this.requestHandler === undefined) {
            await this.write({
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `method not supported: ${method}` },
            });
            return;
        }
        try {
            const result = await this.requestHandler(method, params);
            await this.write({ jsonrpc: '2.0', id, result });
        }
        catch (error) {
            await this.write({
                jsonrpc: '2.0',
                id,
                error: { code: -32000, message: errorFromUnknown(error).message },
            });
        }
    }
    resolvePending(id, value) {
        const pending = this.pending.get(id);
        if (pending === undefined)
            return;
        this.pending.delete(id);
        if (pending.signal !== undefined && pending.onAbort !== undefined) {
            pending.signal.removeEventListener('abort', pending.onAbort);
        }
        pending.resolve(value);
    }
    rejectPending(id, error) {
        const pending = this.pending.get(id);
        if (pending === undefined)
            return;
        this.pending.delete(id);
        if (pending.signal !== undefined && pending.onAbort !== undefined) {
            pending.signal.removeEventListener('abort', pending.onAbort);
        }
        pending.reject(error);
    }
    assertOpen() {
        if (this.closed)
            throw this.fatalError ?? new Error('JSON-RPC transport closed');
    }
    abortError(signal) {
        return signal.reason instanceof Error ? signal.reason : new Error('JSON-RPC request aborted');
    }
}
//# sourceMappingURL=json-rpc.js.map