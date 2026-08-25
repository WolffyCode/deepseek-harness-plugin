import { createInterface, type Interface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue }
export type JsonObject = { readonly [key: string]: JsonValue }
export type JsonRpcId = number | string

interface JsonRpcRequest {
  readonly jsonrpc: '2.0'
  readonly id: JsonRpcId
  readonly method: string
  readonly params?: JsonValue
}

interface JsonRpcNotification {
  readonly jsonrpc: '2.0'
  readonly method: string
  readonly params?: JsonValue
}

interface JsonRpcResponse {
  readonly jsonrpc: '2.0'
  readonly id: JsonRpcId
  readonly result?: JsonValue
  readonly error?: {
    readonly code: number
    readonly message: string
    readonly data?: JsonValue
  }
}

export type JsonRpcRequestHandler = (method: string, params: JsonValue | undefined) => JsonValue | Promise<JsonValue>
export type JsonRpcNotificationHandler = (method: string, params: JsonValue | undefined) => void

interface PendingRequest {
  readonly resolve: (value: JsonValue) => void
  readonly reject: (error: Error) => void
  readonly signal?: AbortSignal
  onAbort?: () => void
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
  readonly reject: (error: Error) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function errorFromUnknown(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))
}

function frame(value: JsonObject): string {
  return `${JSON.stringify(value)}\n`
}

/** A newline-delimited JSON-RPC 2.0 transport for Codex app-server stdio. */
export class JsonRpcLineTransport {
  private readonly pending = new Map<JsonRpcId, PendingRequest>()
  private readonly notificationHandlers = new Set<JsonRpcNotificationHandler>()
  private requestHandler: JsonRpcRequestHandler | undefined
  private readonly closedDeferred = deferred<void>()
  private readline: Interface | undefined
  private nextId = 1
  private closed = false
  private fatalError: Error | undefined

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {}

  get closedPromise(): Promise<void> {
    return this.closedDeferred.promise
  }

  start(): void {
    if (this.readline !== undefined) return
    this.readline = createInterface({ input: this.input, crlfDelay: Infinity })
    this.readline.on('line', line => this.handleLine(line))
    this.readline.on('close', () => this.close(new Error('JSON-RPC input closed')))
    this.input.on('error', error => this.close(errorFromUnknown(error)))
    this.output.on('error', error => this.close(errorFromUnknown(error)))
  }

  onNotification(handler: JsonRpcNotificationHandler): () => void {
    this.notificationHandlers.add(handler)
    return () => this.notificationHandlers.delete(handler)
  }

  onRequest(handler: JsonRpcRequestHandler): () => void {
    if (this.requestHandler !== undefined) throw new Error('JSON-RPC request handler is already registered')
    this.requestHandler = handler
    return () => {
      if (this.requestHandler === handler) this.requestHandler = undefined
    }
  }

  async request<T extends JsonValue = JsonValue>(
    method: string,
    params?: JsonValue,
    signal?: AbortSignal,
  ): Promise<T> {
    this.assertOpen()
    if (signal?.aborted) throw this.abortError(signal)
    const id = this.nextId++
    const result = deferred<JsonValue>()
    const pending: PendingRequest = {
      resolve: result.resolve,
      reject: result.reject,
      ...signal === undefined ? {} : { signal },
    }
    if (signal !== undefined) {
      const onAbort = (): void => {
        if (this.pending.delete(id)) result.reject(this.abortError(signal))
      }
      pending.onAbort = onAbort
      signal.addEventListener('abort', onAbort, { once: true })
    }
    this.pending.set(id, pending)
    try {
      await this.write({ jsonrpc: '2.0', id, method, ...params === undefined ? {} : { params } })
    } catch (error: unknown) {
      this.rejectPending(id, errorFromUnknown(error))
    }
    return result.promise as Promise<T>
  }

  async notify(method: string, params?: JsonValue): Promise<void> {
    this.assertOpen()
    await this.write({ jsonrpc: '2.0', method, ...params === undefined ? {} : { params } })
  }

  close(error?: Error): void {
    if (this.closed) return
    this.closed = true
    this.fatalError = error
    this.readline?.close()
    for (const id of this.pending.keys()) this.rejectPending(id, error ?? new Error('JSON-RPC transport closed'))
    this.closedDeferred.resolve(undefined)
  }

  private async write(value: JsonObject): Promise<void> {
    if (this.closed) throw this.fatalError ?? new Error('JSON-RPC transport closed')
    const output = frame(value)
    if (this.output.write(output)) return
    await new Promise<void>((resolve, reject) => {
      const onDrain = (): void => {
        this.output.off('error', onError)
        resolve()
      }
      const onError = (error: Error): void => {
        this.output.off('drain', onDrain)
        reject(error)
      }
      this.output.once('drain', onDrain)
      this.output.once('error', onError)
    })
  }

  private handleLine(line: string): void {
    if (line.trim() === '') return
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch (error: unknown) {
      this.close(new Error(`invalid JSON-RPC line: ${errorFromUnknown(error).message}`))
      return
    }
    if (!isObject(value) || value['jsonrpc'] !== '2.0') {
      this.close(new Error('invalid JSON-RPC message'))
      return
    }
    if ('method' in value && typeof value['method'] === 'string') {
      if ('id' in value && isJsonRpcId(value['id'])) {
        void this.handleRequest(value['id'] as JsonRpcId, value['method'] as string, value['params'] as JsonValue | undefined)
      } else {
        for (const handler of this.notificationHandlers) handler(value['method'] as string, value['params'] as JsonValue | undefined)
      }
      return
    }
    if (!('id' in value) || !isJsonRpcId(value['id'])) {
      this.close(new Error('JSON-RPC response has no valid id'))
      return
    }
    const response = value as unknown as JsonRpcResponse
    if (response.error !== undefined) {
      this.rejectPending(response['id'], new Error(`JSON-RPC ${response.error.code}: ${response.error.message}`))
      return
    }
    this.resolvePending(response['id'], response['result'] ?? null)
  }

  private async handleRequest(id: JsonRpcId, method: string, params: JsonValue | undefined): Promise<void> {
    if (this.requestHandler === undefined) {
      await this.write({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `method not supported: ${method}` },
      })
      return
    }
    try {
      const result = await this.requestHandler(method, params)
      await this.write({ jsonrpc: '2.0', id, result })
    } catch (error: unknown) {
      await this.write({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: errorFromUnknown(error).message },
      })
    }
  }

  private resolvePending(id: JsonRpcId, value: JsonValue): void {
    const pending = this.pending.get(id)
    if (pending === undefined) return
    this.pending.delete(id)
    if (pending.signal !== undefined && pending.onAbort !== undefined) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
    pending.resolve(value)
  }

  private rejectPending(id: JsonRpcId, error: Error): void {
    const pending = this.pending.get(id)
    if (pending === undefined) return
    this.pending.delete(id)
    if (pending.signal !== undefined && pending.onAbort !== undefined) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
    pending.reject(error)
  }

  private assertOpen(): void {
    if (this.closed) throw this.fatalError ?? new Error('JSON-RPC transport closed')
  }

  private abortError(signal: AbortSignal): Error {
    return signal.reason instanceof Error ? signal.reason : new Error('JSON-RPC request aborted')
  }
}
