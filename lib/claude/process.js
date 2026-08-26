import { spawn } from 'node:child_process';
const MAX_STDERR_BYTES = 16_384;
const REDACTED = '[REDACTED]';
function appendTail(current, chunk) {
    const next = current + chunk;
    if (Buffer.byteLength(next, 'utf8') <= MAX_STDERR_BYTES)
        return next;
    let tail = next.slice(-MAX_STDERR_BYTES);
    while (Buffer.byteLength(tail, 'utf8') > MAX_STDERR_BYTES)
        tail = tail.slice(1);
    return tail;
}
function redact(value, redactions) {
    return redactions.reduce((result, secret) => {
        if (secret.length === 0)
            return result;
        return result.split(secret).join(REDACTED);
    }, value);
}
function killProcessTree(child, signal) {
    if (child.pid === undefined)
        return child.kill(signal);
    try {
        if (process.platform !== 'win32') {
            process.kill(-child.pid, signal);
            return true;
        }
    }
    catch {
        // The process group may already have exited; fall back to the direct child.
    }
    try {
        return child.kill(signal);
    }
    catch {
        return false;
    }
}
/**
 * Owns the Claude CLI child used by the SDK bridge.
 *
 * The SDK passes a complete environment to custom spawners. It is intentionally
 * copied as-is rather than merged with the host environment, so credentials or
 * provider settings from the parent shell cannot leak into the Claude process.
 */
export class ClaudeProcess {
    child;
    redactions;
    abortSignal;
    abortHandler;
    stderr = '';
    terminatedSignal = null;
    closed = false;
    exitPromise;
    closePromise;
    terminationPromise;
    constructor(options) {
        this.redactions = [...options.redactions ?? []].filter(secret => secret.length > 0);
        this.abortSignal = options.signal;
        this.abortHandler = () => { this.kill('SIGTERM'); };
        this.child = spawn(options.command, [...options.args], {
            ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
            env: { ...options.env },
            shell: false,
            detached: process.platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.child.stderr.on('data', chunk => {
            this.stderr = appendTail(this.stderr, redact(String(chunk), this.redactions));
        });
        this.exitPromise = new Promise(resolve => {
            let error;
            let settled = false;
            const finish = (code, signal) => {
                if (settled)
                    return;
                settled = true;
                this.terminatedSignal = signal;
                resolve({
                    code,
                    signal,
                    stderr: this.stderr,
                    ...(error === undefined ? {} : { error: this.redactError(error) }),
                });
            };
            this.child.once('error', value => {
                error = value instanceof Error ? value : new Error(String(value));
                finish(this.child.exitCode ?? null, this.child.signalCode ?? null);
            });
            this.child.once('exit', (code, signal) => finish(code, signal));
        });
        this.closePromise = new Promise(resolve => { this.child.once('close', () => resolve()); });
        this.terminationPromise = Promise.all([this.exitPromise, this.closePromise]).then(([exit]) => exit);
        if (options.signal.aborted)
            this.abortHandler();
        else
            options.signal.addEventListener('abort', this.abortHandler, { once: true });
    }
    static start(options) {
        return new ClaudeProcess(options);
    }
    get stdin() { return this.child.stdin; }
    get stdout() { return this.child.stdout; }
    get killed() { return this.child.killed; }
    get exitCode() { return this.child.exitCode ?? null; }
    get signalCode() { return this.terminatedSignal; }
    get pid() { return this.child.pid; }
    get stderrTail() { return this.stderr; }
    get exited() { return this.exitPromise; }
    kill(signal) {
        return killProcessTree(this.child, signal);
    }
    on(event, listener) {
        if (event === 'exit')
            this.child.on('exit', listener);
        else
            this.child.on('error', listener);
        return this;
    }
    once(event, listener) {
        if (event === 'exit')
            this.child.once('exit', listener);
        else
            this.child.once('error', listener);
        return this;
    }
    off(event, listener) {
        if (event === 'exit')
            this.child.off('exit', listener);
        else
            this.child.off('error', listener);
        return this;
    }
    async close(graceMs = 2_000) {
        if (this.closed)
            return this.terminationPromise;
        this.closed = true;
        this.abortSignal.removeEventListener('abort', this.abortHandler);
        this.stdin.end();
        const graceful = await this.waitForTermination(graceMs);
        if (graceful !== undefined)
            return graceful;
        this.kill('SIGTERM');
        const terminated = await this.waitForTermination(graceMs);
        if (terminated !== undefined)
            return terminated;
        this.kill('SIGKILL');
        return this.terminationPromise;
    }
    async waitForTermination(graceMs) {
        let timer;
        try {
            return await Promise.race([
                this.terminationPromise,
                new Promise(resolve => { timer = setTimeout(() => resolve(undefined), graceMs); }),
            ]);
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
        }
    }
    redactError(error) {
        return new Error(redact(error.message, this.redactions), { cause: error.cause });
    }
}
export function claudeProcessRedactions(options) {
    return [
        options.authToken,
        options.environment?.['ANTHROPIC_AUTH_TOKEN'],
        options.environment?.['ANTHROPIC_API_KEY'],
    ].filter((value) => value !== undefined && value.length > 0);
}
//# sourceMappingURL=process.js.map