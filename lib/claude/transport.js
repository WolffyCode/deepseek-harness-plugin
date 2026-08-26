import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
/** Environment keys whose values are credentials of this Claude session. */
const CREDENTIAL_ENV_KEYS = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'];
const REDACTED = '[REDACTED]';
function stringifyUnknown(value) {
    if (typeof value === 'string')
        return value;
    try {
        return JSON.stringify(value) ?? String(value);
    }
    catch {
        return String(value);
    }
}
/**
 * Narrow credential redactor for the Claude error boundary. Replaces only this
 * session's exact credential values — authToken and the credential env entries
 * (ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY). Ordinary URIs, paths, and
 * diagnostic text pass through untouched, and a session without credentials
 * is a no-op.
 */
export class ClaudeCredentialRedactor {
    secrets;
    constructor(secrets) {
        const unique = new Set();
        for (const secret of secrets)
            if (typeof secret === 'string' && secret.length > 0)
                unique.add(secret);
        // Longest first so overlapping credentials are consumed deterministically.
        this.secrets = [...unique].sort((a, b) => b.length - a.length);
    }
    static fromAdapterOptions(options) {
        const secrets = [];
        if (options.authToken !== undefined)
            secrets.push(options.authToken);
        for (const key of CREDENTIAL_ENV_KEYS) {
            const value = options.environment?.[key];
            if (value !== undefined)
                secrets.push(value);
        }
        return new ClaudeCredentialRedactor(secrets);
    }
    redact(text) {
        if (this.secrets.length === 0)
            return text;
        let current = text;
        for (const secret of this.secrets)
            current = current.split(secret).join(REDACTED);
        return current;
    }
    redactValue(value) {
        if (this.secrets.length === 0)
            return value;
        return this.redactValueSeen(value, new Map());
    }
    redactError(error) {
        if (error instanceof Error)
            return this.redactErrorSeen(error, new Map());
        return new Error(this.redact(stringifyUnknown(error)));
    }
    redactValueSeen(value, seen) {
        if (typeof value === 'string')
            return this.redact(value);
        if (typeof value !== 'object' || value === null)
            return value;
        const existing = seen.get(value);
        if (existing !== undefined)
            return existing;
        if (value instanceof Error)
            return this.redactErrorSeen(value, seen);
        if (Array.isArray(value)) {
            const copy = [];
            seen.set(value, copy);
            for (const key of Reflect.ownKeys(value)) {
                if (key === 'length')
                    continue;
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (descriptor === undefined || !('value' in descriptor))
                    continue;
                Object.defineProperty(copy, key, { ...descriptor, value: this.redactValueSeen(descriptor.value, seen) });
            }
            return copy;
        }
        const copy = {};
        seen.set(value, copy);
        for (const key of Reflect.ownKeys(value)) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (descriptor === undefined || !('value' in descriptor))
                continue;
            Object.defineProperty(copy, key, { ...descriptor, value: this.redactValueSeen(descriptor.value, seen) });
        }
        return copy;
    }
    redactErrorSeen(error, seen) {
        const existing = seen.get(error);
        if (existing instanceof Error)
            return existing;
        const redacted = new Error(this.redact(error.message));
        seen.set(error, redacted);
        redacted.name = this.redact(error.name);
        if (error.stack !== undefined)
            redacted.stack = this.redact(error.stack);
        for (const key of Reflect.ownKeys(error)) {
            if (key === 'message' || key === 'stack' || key === 'cause')
                continue;
            const descriptor = Object.getOwnPropertyDescriptor(error, key);
            if (descriptor === undefined || !('value' in descriptor))
                continue;
            Object.defineProperty(redacted, key, { ...descriptor, value: this.redactValueSeen(descriptor.value, seen) });
        }
        const cause = error.cause;
        if (cause !== undefined)
            Object.defineProperty(redacted, 'cause', { value: this.redactValueSeen(cause, seen), enumerable: false, writable: true, configurable: true });
        return redacted;
    }
}
class InputQueue {
    values = [];
    waiters = [];
    ended = false;
    push(message) {
        if (this.ended)
            throw new Error('Claude transport input is closed');
        const waiter = this.waiters.shift();
        if (waiter)
            waiter({ value: message, done: false });
        else
            this.values.push(message);
    }
    end() {
        if (this.ended)
            return;
        this.ended = true;
        while (this.waiters.length)
            this.waiters.shift()?.({ value: undefined, done: true });
    }
    async *[Symbol.asyncIterator]() {
        while (true) {
            if (this.values.length) {
                yield this.values.shift();
                continue;
            }
            if (this.ended)
                return;
            const next = await new Promise(resolve => this.waiters.push(resolve));
            if (next.done)
                return;
            yield next.value;
        }
    }
}
export class ClaudeSdkTransport {
    input = new InputQueue();
    listeners = new Set();
    redactor;
    query;
    pump;
    closed = false;
    constructor(options, queryFactory = createSdkQuery, redactor = new ClaudeCredentialRedactor([])) {
        this.redactor = redactor;
        try {
            this.query = queryFactory({ prompt: this.input, options });
        }
        catch (error) {
            throw this.redactor.redactError(error);
        }
        this.pump = this.consume();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    send(message) {
        if (this.closed)
            throw new Error('Claude transport is closed');
        this.input.push(message);
    }
    async interrupt() {
        if (this.closed)
            return;
        try {
            await this.query.interrupt();
        }
        catch (error) {
            throw this.redactor.redactError(error);
        }
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.input.end();
        try {
            if (typeof this.query.close === 'function')
                this.query.close();
        }
        catch (error) {
            await this.pump.catch(() => undefined);
            throw this.redactor.redactError(error);
        }
        try {
            await this.query.return?.();
        }
        catch (error) {
            await this.pump.catch(() => undefined);
            throw this.redactor.redactError(error);
        }
        await this.pump.catch(() => undefined);
    }
    async consume() {
        try {
            for await (const message of this.query)
                this.emit({ type: 'message', message });
            if (!this.closed)
                this.emit({ type: 'ended' });
        }
        catch (error) {
            if (!this.closed)
                this.emit({ type: 'ended', error: this.redactor.redactError(error) });
        }
    }
    emit(event) {
        const safeEvent = this.redactor.redactValue(event);
        for (const listener of [...this.listeners])
            listener(safeEvent);
    }
}
function createSdkQuery(input) {
    return sdkQuery({ prompt: input.prompt, options: input.options });
}
//# sourceMappingURL=transport.js.map