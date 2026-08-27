import { createInterface, type Interface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue }
export type JsonObject = { readonly [key: string]: JsonValue }
export type JsonRpcId = number | string

interface JsonRpcError {
  readonly code: number
  readonly message: string
  readonly data?: JsonValue
}

export type JsonRpcRequestHandler = (method: string, params: JsonValue | undefined) => JsonValue | Promise<JsonValue>
export type JsonRpcNotificationHandler = (method: string, params: JsonValue | undefined) => void

interface PendingRequest {
  readonly resolve: (value: JsonValue) => void
  readonly reject: (error: Error) => void
  readonly signal?: AbortSignal
  onAbort?: () => void
}

interface BlockedWrite {
  readonly close: () => void
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

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))
}

function isJsonRpcError(value: unknown): value is JsonRpcError {
  return isObject(value)
    && typeof value['code'] === 'number'
    && Number.isInteger(value['code'])
    && typeof value['message'] === 'string'
}

function frame(value: JsonObject): string {
  return `${JSON.stringify(value)}\n`
}

/** A newline-delimited JSON-RPC 2.0 transport for Codex app-server stdio. */
export class JsonRpcLineTransport {
  private readonly pending = new Map<JsonRpcId, PendingRequest>()
  private readonly notificationHandlers = new Set<JsonRpcNotificationHandler>()
  private readonly blockedWrites = new Set<BlockedWrite>()
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
    if (this.readline !== undefined || this.closed) return
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
    this.pending.set(id, pending)

    if (signal !== undefined) {
      const onAbort = (): void => {
        if (!this.pending.has(id)) return
        this.rejectPending(id, this.abortError(signal))
      }
      pending.onAbort = onAbort
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    }

    if (this.pending.has(id)) {
      try {
        await this.write({ jsonrpc: '2.0', id, method, ...params === undefined ? {} : { params } })
      } catch (error: unknown) {
        this.rejectPending(id, errorFromUnknown(error))
      }
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

    const closeError = error ?? new Error('JSON-RPC transport closed')
    for (const blockedWrite of [...this.blockedWrites]) blockedWrite.close()
    for (const id of [...this.pending.keys()]) this.rejectPending(id, closeError)
    this.closedDeferred.resolve(undefined)
  }

  private async write(value: JsonObject): Promise<void> {
    if (this.closed) throw this.fatalError ?? new Error('JSON-RPC transport closed')

    let accepted: boolean
    try {
      accepted = this.output.write(frame(value))
    } catch (error: unknown) {
      const failure = errorFromUnknown(error)
      this.close(failure)
      throw failure
    }
    if (accepted) return

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const cleanup = (): void => {
        this.output.off('drain', onDrain)
        this.output.off('error', onError)
        this.blockedWrites.delete(blockedWrite)
      }
      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        cleanup()
        callback()
      }
      const onDrain = (): void => finish(resolve)
      const onError = (error: Error): void => {
        const failure = errorFromUnknown(error)
        this.close(failure)
        finish(() => reject(failure))
      }
      const blockedWrite: BlockedWrite = {
        close: () => finish(() => reject(this.fatalError ?? new Error('JSON-RPC transport closed'))),
      }

      this.blockedWrites.add(blockedWrite)
      this.output.once('drain', onDrain)
      this.output.once('error', onError)
      if (this.closed) blockedWrite.close()
    })
  }

  private handleLine(line: string): void {
    if (this.closed) return
    if (line.trim() === '') {
      this.protocolError('invalid JSON-RPC frame: empty line')
      return
    }

    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      this.protocolError('invalid JSON-RPC frame: malformed JSON')
      return
    }
    if (!isObject(value)) {
      this.protocolError('invalid JSON-RPC frame: expected a JSON object')
      return
    }

    // Codex app-server accepts JSON-RPC-shaped messages without the marker,
    // so the marker is optional here but must be correct when present.
    if (hasOwn(value, 'jsonrpc') && value['jsonrpc'] !== '2.0') {
      this.protocolError('invalid JSON-RPC frame: jsonrpc must be "2.0"')
      return
    }

    if (hasOwn(value, 'method')) {
      if (hasOwn(value, 'result') || hasOwn(value, 'error')) {
        this.protocolError('invalid JSON-RPC frame: request cannot include result or error')
        return
      }
      if (typeof value['method'] !== 'string') {
        this.protocolError('invalid JSON-RPC request: method must be a string')
        return
      }
      if (hasOwn(value, 'id')) {
        if (!isJsonRpcId(value['id'])) {
          this.protocolError('invalid JSON-RPC request id')
          return
        }
        void this.handleRequest(value['id'], value['method'], value['params'] as JsonValue | undefined)
      } else {
        try {
          for (const handler of this.notificationHandlers) handler(value['method'], value['params'] as JsonValue | undefined)
        } catch (error: unknown) {
          this.close(errorFromUnknown(error))
        }
      }
      return
    }

    if (!hasOwn(value, 'id') || !isJsonRpcId(value['id'])) {
      this.protocolError('invalid JSON-RPC response id')
      return
    }
    const id = value['id']
    if (!this.pending.has(id)) {
      this.protocolError('unknown JSON-RPC response id')
      return
    }

    const hasResult = hasOwn(value, 'result')
    const hasError = hasOwn(value, 'error')
    if (hasResult === hasError) {
      this.protocolError('invalid JSON-RPC response: expected exactly one of result or error')
      return
    }
    if (hasError) {
      if (!isJsonRpcError(value['error'])) {
        this.protocolError('invalid JSON-RPC response error')
        return
      }
      const responseError = value['error']
      this.rejectPending(id, new Error(`JSON-RPC ${responseError.code}: ${responseError.message}`))
      return
    }
    this.resolvePending(id, value['result'] as JsonValue)
  }

  private async handleRequest(id: JsonRpcId, method: string, params: JsonValue | undefined): Promise<void> {
    let response: JsonObject
    if (this.requestHandler === undefined) {
      response = {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'JSON-RPC method not supported' },
      }
    } else {
      try {
        const result = await this.requestHandler(method, params)
        response = { jsonrpc: '2.0', id, result }
      } catch {
        // Never copy arbitrary handler errors to stdout: they may contain credentials.
        response = {
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: 'JSON-RPC request handler failed' },
        }
      }
    }

    try {
      await this.write(response)
    } catch (error: unknown) {
      this.close(errorFromUnknown(error))
    }
  }

  private protocolError(message: string): void {
    this.close(new Error(message))
  }

  private resolvePending(id: JsonRpcId, value: JsonValue): void {
    const pending = this.pending.get(id)
    if (pending === undefined) return
    this.pending.delete(id)
    this.removeAbortListener(pending)
    pending.resolve(value)
  }

  private rejectPending(id: JsonRpcId, error: Error): void {
    const pending = this.pending.get(id)
    if (pending === undefined) return
    this.pending.delete(id)
    this.removeAbortListener(pending)
    pending.reject(error)
  }

  private removeAbortListener(pending: PendingRequest): void {
    if (pending.signal !== undefined && pending.onAbort !== undefined) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
  }

  private assertOpen(): void {
    if (this.closed) throw this.fatalError ?? new Error('JSON-RPC transport closed')
  }

  private abortError(signal: AbortSignal): Error {
    return signal.reason instanceof Error ? signal.reason : new Error('JSON-RPC request aborted')
  }
}
