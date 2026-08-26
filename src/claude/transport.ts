import { query as sdkQuery, type Query, type SDKMessage, type Options as ClaudeSdkOptions } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeInputMessage, ClaudeQueryFactory, ClaudeQueryFactoryInput } from './types.js'

export type ClaudeTransportEvent =
  | { readonly type: 'message'; readonly message: SDKMessage }
  | { readonly type: 'ended'; readonly error?: Error }

export interface ClaudeTransport {
  readonly query: Query
  subscribe(listener: (event: ClaudeTransportEvent) => void): () => void
  send(message: ClaudeInputMessage): void
  interrupt(): Promise<void>
  close(): Promise<void>
}

/** Environment keys whose values are credentials of this Claude session. */
const CREDENTIAL_ENV_KEYS = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const
const REDACTED = '[REDACTED]'

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
}

/**
 * Narrow credential redactor for the Claude error boundary. Replaces only this
 * session's exact credential values — authToken and the credential env entries
 * (ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY). Ordinary URIs, paths, and
 * diagnostic text pass through untouched, and a session without credentials
 * is a no-op.
 */
export class ClaudeCredentialRedactor {
  private readonly secrets: readonly string[]

  constructor(secrets: Iterable<string>) {
    const unique = new Set<string>()
    for (const secret of secrets) if (typeof secret === 'string' && secret.length > 0) unique.add(secret)
    // Longest first so overlapping credentials are consumed deterministically.
    this.secrets = [...unique].sort((a, b) => b.length - a.length)
  }

  static fromAdapterOptions(options: {
    readonly authToken?: string
    readonly environment?: Readonly<Record<string, string | undefined>>
  }): ClaudeCredentialRedactor {
    const secrets: string[] = []
    if (options.authToken !== undefined) secrets.push(options.authToken)
    for (const key of CREDENTIAL_ENV_KEYS) {
      const value = options.environment?.[key]
      if (value !== undefined) secrets.push(value)
    }
    return new ClaudeCredentialRedactor(secrets)
  }

  redact(text: string): string {
    if (this.secrets.length === 0) return text
    let current = text
    for (const secret of this.secrets) current = current.split(secret).join(REDACTED)
    return current
  }

  redactValue<T>(value: T): T {
    if (this.secrets.length === 0) return value
    return this.redactValueSeen(value, new Map()) as T
  }

  redactError(error: unknown): Error {
    if (error instanceof Error) return this.redactErrorSeen(error, new Map())
    return new Error(this.redact(stringifyUnknown(error)))
  }

  private redactValueSeen(value: unknown, seen: Map<object, unknown>): unknown {
    if (typeof value === 'string') return this.redact(value)
    if (typeof value !== 'object' || value === null) return value
    const existing = seen.get(value)
    if (existing !== undefined) return existing
    if (value instanceof Error) return this.redactErrorSeen(value, seen)
    if (Array.isArray(value)) {
      const copy: unknown[] = []
      seen.set(value, copy)
      for (const key of Reflect.ownKeys(value)) {
        if (key === 'length') continue
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor === undefined || !('value' in descriptor)) continue
        Object.defineProperty(copy, key, { ...descriptor, value: this.redactValueSeen(descriptor.value, seen) })
      }
      return copy
    }
    const copy: Record<PropertyKey, unknown> = {}
    seen.set(value, copy)
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !('value' in descriptor)) continue
      Object.defineProperty(copy, key, { ...descriptor, value: this.redactValueSeen(descriptor.value, seen) })
    }
    return copy
  }

  private redactErrorSeen(error: Error, seen: Map<object, unknown>): Error {
    const existing = seen.get(error)
    if (existing instanceof Error) return existing
    const redacted = new Error(this.redact(error.message))
    seen.set(error, redacted)
    redacted.name = this.redact(error.name)
    if (error.stack !== undefined) redacted.stack = this.redact(error.stack)
    for (const key of Reflect.ownKeys(error)) {
      if (key === 'message' || key === 'stack' || key === 'cause') continue
      const descriptor = Object.getOwnPropertyDescriptor(error, key)
      if (descriptor === undefined || !('value' in descriptor)) continue
      Object.defineProperty(redacted, key, { ...descriptor, value: this.redactValueSeen(descriptor.value, seen) })
    }
    const cause = (error as { cause?: unknown }).cause
    if (cause !== undefined) Object.defineProperty(redacted, 'cause', { value: this.redactValueSeen(cause, seen), enumerable: false, writable: true, configurable: true })
    return redacted
  }
}

class InputQueue implements AsyncIterable<ClaudeInputMessage> {
  private readonly values: ClaudeInputMessage[] = []
  private readonly waiters: Array<(result: IteratorResult<ClaudeInputMessage, undefined>) => void> = []
  private ended = false

  push(message: ClaudeInputMessage): void {
    if (this.ended) throw new Error('Claude transport input is closed')
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: message, done: false })
    else this.values.push(message)
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    while (this.waiters.length) this.waiters.shift()?.({ value: undefined, done: true })
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<ClaudeInputMessage, undefined> {
    while (true) {
      if (this.values.length) {
        yield this.values.shift()!
        continue
      }
      if (this.ended) return
      const next = await new Promise<IteratorResult<ClaudeInputMessage, undefined>>(resolve => this.waiters.push(resolve))
      if (next.done) return
      yield next.value
    }
  }
}

export class ClaudeSdkTransport implements ClaudeTransport {
  private readonly input = new InputQueue()
  private readonly listeners = new Set<(event: ClaudeTransportEvent) => void>()
  private readonly redactor: ClaudeCredentialRedactor
  readonly query: Query
  private readonly pump: Promise<void>
  private closed = false

  constructor(options: ClaudeSdkOptions, queryFactory: ClaudeQueryFactory = createSdkQuery, redactor: ClaudeCredentialRedactor = new ClaudeCredentialRedactor([])) {
    this.redactor = redactor
    try {
      this.query = queryFactory({ prompt: this.input, options })
    } catch (error) {
      throw this.redactor.redactError(error)
    }
    this.pump = this.consume()
  }

  subscribe(listener: (event: ClaudeTransportEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  send(message: ClaudeInputMessage): void {
    if (this.closed) throw new Error('Claude transport is closed')
    this.input.push(message)
  }

  async interrupt(): Promise<void> {
    if (this.closed) return
    try {
      await this.query.interrupt()
    } catch (error) {
      throw this.redactor.redactError(error)
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.input.end()
    try {
      if (typeof this.query.close === 'function') this.query.close()
    } catch (error) {
      await this.pump.catch(() => undefined)
      throw this.redactor.redactError(error)
    }
    try {
      await this.query.return?.()
    } catch (error) {
      await this.pump.catch(() => undefined)
      throw this.redactor.redactError(error)
    }
    await this.pump.catch(() => undefined)
  }

  private async consume(): Promise<void> {
    try {
      for await (const message of this.query) this.emit({ type: 'message', message })
      if (!this.closed) this.emit({ type: 'ended' })
    } catch (error) {
      if (!this.closed) this.emit({ type: 'ended', error: this.redactor.redactError(error) })
    }
  }

  private emit(event: ClaudeTransportEvent): void {
    const safeEvent = this.redactor.redactValue(event)
    for (const listener of [...this.listeners]) listener(safeEvent)
  }
}

function createSdkQuery(input: ClaudeQueryFactoryInput): Query {
  return sdkQuery({ prompt: input.prompt, options: input.options })
}
