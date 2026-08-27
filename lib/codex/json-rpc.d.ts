import type { Readable, Writable } from 'node:stream';
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export type JsonObject = {
    readonly [key: string]: JsonValue;
};
export type JsonRpcId = number | string;
export type JsonRpcRequestHandler = (method: string, params: JsonValue | undefined) => JsonValue | Promise<JsonValue>;
export type JsonRpcNotificationHandler = (method: string, params: JsonValue | undefined) => void;
/** A newline-delimited JSON-RPC 2.0 transport for Codex app-server stdio. */
export declare class JsonRpcLineTransport {
    private readonly input;
    private readonly output;
    private readonly pending;
    private readonly notificationHandlers;
    private readonly blockedWrites;
    private requestHandler;
    private readonly closedDeferred;
    private readline;
    private nextId;
    private closed;
    private fatalError;
    constructor(input: Readable, output: Writable);
    get closedPromise(): Promise<void>;
    start(): void;
    onNotification(handler: JsonRpcNotificationHandler): () => void;
    onRequest(handler: JsonRpcRequestHandler): () => void;
    request<T extends JsonValue = JsonValue>(method: string, params?: JsonValue, signal?: AbortSignal): Promise<T>;
    notify(method: string, params?: JsonValue): Promise<void>;
    close(error?: Error): void;
    private write;
    private handleLine;
    private handleRequest;
    private protocolError;
    private resolvePending;
    private rejectPending;
    private removeAbortListener;
    private assertOpen;
    private abortError;
}
//# sourceMappingURL=json-rpc.d.ts.map