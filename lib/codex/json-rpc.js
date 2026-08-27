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
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function isJsonRpcId(value) {
    return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value));
}
function isJsonRpcError(value) {
    return isObject(value)
        && typeof value['code'] === 'number'
        && Number.isInteger(value['code'])
        && typeof value['message'] === 'string';
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
    blockedWrites = new Set();
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
        if (this.readline !== undefined || this.closed)
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
        this.pending.set(id, pending);
        if (signal !== undefined) {
            const onAbort = () => {
                if (!this.pending.has(id))
                    return;
                this.rejectPending(id, this.abortError(signal));
            };
            pending.onAbort = onAbort;
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted)
                onAbort();
        }
        if (this.pending.has(id)) {
            try {
                await this.write({ jsonrpc: '2.0', id, method, ...params === undefined ? {} : { params } });
            }
            catch (error) {
                this.rejectPending(id, errorFromUnknown(error));
            }
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
        const closeError = error ?? new Error('JSON-RPC transport closed');
        for (const blockedWrite of [...this.blockedWrites])
            blockedWrite.close();
        for (const id of [...this.pending.keys()])
            this.rejectPending(id, closeError);
        this.closedDeferred.resolve(undefined);
    }
    async write(value) {
        if (this.closed)
            throw this.fatalError ?? new Error('JSON-RPC transport closed');
        let accepted;
        try {
            accepted = this.output.write(frame(value));
        }
        catch (error) {
            const failure = errorFromUnknown(error);
            this.close(failure);
            throw failure;
        }
        if (accepted)
            return;
        await new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
                this.output.off('drain', onDrain);
                this.output.off('error', onError);
                this.blockedWrites.delete(blockedWrite);
            };
            const finish = (callback) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                callback();
            };
            const onDrain = () => finish(resolve);
            const onError = (error) => {
                const failure = errorFromUnknown(error);
                this.close(failure);
                finish(() => reject(failure));
            };
            const blockedWrite = {
                close: () => finish(() => reject(this.fatalError ?? new Error('JSON-RPC transport closed'))),
            };
            this.blockedWrites.add(blockedWrite);
            this.output.once('drain', onDrain);
            this.output.once('error', onError);
            if (this.closed)
                blockedWrite.close();
        });
    }
    handleLine(line) {
        if (this.closed)
            return;
        if (line.trim() === '') {
            this.protocolError('invalid JSON-RPC frame: empty line');
            return;
        }
        let value;
        try {
            value = JSON.parse(line);
        }
        catch {
            this.protocolError('invalid JSON-RPC frame: malformed JSON');
            return;
        }
        if (!isObject(value)) {
            this.protocolError('invalid JSON-RPC frame: expected a JSON object');
            return;
        }
        // Codex app-server accepts JSON-RPC-shaped messages without the marker,
        // so the marker is optional here but must be correct when present.
        if (hasOwn(value, 'jsonrpc') && value['jsonrpc'] !== '2.0') {
            this.protocolError('invalid JSON-RPC frame: jsonrpc must be "2.0"');
            return;
        }
        if (hasOwn(value, 'method')) {
            if (hasOwn(value, 'result') || hasOwn(value, 'error')) {
                this.protocolError('invalid JSON-RPC frame: request cannot include result or error');
                return;
            }
            if (typeof value['method'] !== 'string') {
                this.protocolError('invalid JSON-RPC request: method must be a string');
                return;
            }
            if (hasOwn(value, 'id')) {
                if (!isJsonRpcId(value['id'])) {
                    this.protocolError('invalid JSON-RPC request id');
                    return;
                }
                void this.handleRequest(value['id'], value['method'], value['params']);
            }
            else {
                try {
                    for (const handler of this.notificationHandlers)
                        handler(value['method'], value['params']);
                }
                catch (error) {
                    this.close(errorFromUnknown(error));
                }
            }
            return;
        }
        if (!hasOwn(value, 'id') || !isJsonRpcId(value['id'])) {
            this.protocolError('invalid JSON-RPC response id');
            return;
        }
        const id = value['id'];
        if (!this.pending.has(id)) {
            this.protocolError('unknown JSON-RPC response id');
            return;
        }
        const hasResult = hasOwn(value, 'result');
        const hasError = hasOwn(value, 'error');
        if (hasResult === hasError) {
            this.protocolError('invalid JSON-RPC response: expected exactly one of result or error');
            return;
        }
        if (hasError) {
            if (!isJsonRpcError(value['error'])) {
                this.protocolError('invalid JSON-RPC response error');
                return;
            }
            const responseError = value['error'];
            this.rejectPending(id, new Error(`JSON-RPC ${responseError.code}: ${responseError.message}`));
            return;
        }
        this.resolvePending(id, value['result']);
    }
    async handleRequest(id, method, params) {
        let response;
        if (this.requestHandler === undefined) {
            response = {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: 'JSON-RPC method not supported' },
            };
        }
        else {
            try {
                const result = await this.requestHandler(method, params);
                response = { jsonrpc: '2.0', id, result };
            }
            catch {
                // Never copy arbitrary handler errors to stdout: they may contain credentials.
                response = {
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32000, message: 'JSON-RPC request handler failed' },
                };
            }
        }
        try {
            await this.write(response);
        }
        catch (error) {
            this.close(errorFromUnknown(error));
        }
    }
    protocolError(message) {
        this.close(new Error(message));
    }
    resolvePending(id, value) {
        const pending = this.pending.get(id);
        if (pending === undefined)
            return;
        this.pending.delete(id);
        this.removeAbortListener(pending);
        pending.resolve(value);
    }
    rejectPending(id, error) {
        const pending = this.pending.get(id);
        if (pending === undefined)
            return;
        this.pending.delete(id);
        this.removeAbortListener(pending);
        pending.reject(error);
    }
    removeAbortListener(pending) {
        if (pending.signal !== undefined && pending.onAbort !== undefined) {
            pending.signal.removeEventListener('abort', pending.onAbort);
        }
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