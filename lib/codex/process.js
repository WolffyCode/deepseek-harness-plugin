import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { childEnvironment } from '../process-env.js';
const DEFAULT_DISPOSE_GRACE_MS = 3_000;
const MAX_STDERR_BYTES = 16_384;
const REDACTED = '[REDACTED]';
function appendTail(current, chunk, maxBytes = MAX_STDERR_BYTES) {
    const next = current + chunk;
    if (Buffer.byteLength(next, 'utf8') <= maxBytes)
        return next;
    return Buffer.from(next, 'utf8').subarray(-maxBytes).toString('utf8');
}
function normalizeRedactions(redactions) {
    return [...new Set((redactions ?? []).filter(secret => secret.length > 0))]
        .sort((left, right) => right.length - left.length);
}
function redact(value, redactions) {
    return redactions.reduce((result, secret) => result.split(secret).join(REDACTED), value);
}
function pendingSecretPrefixLength(value, redactions) {
    const longestSecretLength = redactions[0]?.length ?? 0;
    for (let length = Math.min(value.length, longestSecretLength - 1); length > 0; length -= 1) {
        const suffix = value.slice(-length);
        if (redactions.some(secret => secret.startsWith(suffix)))
            return length;
    }
    return 0;
}
function killProcessTree(child, signal) {
    if (child.pid !== undefined && process.platform !== 'win32') {
        try {
            process.kill(-child.pid, signal);
            return true;
        }
        catch {
            // The process group may already have exited; fall back to the direct child.
        }
    }
    try {
        return child.kill(signal);
    }
    catch {
        return false;
    }
}
async function scrubSecretFiles(root, secrets) {
    if (root === undefined || secrets.length === 0)
        return;
    const snapshotRoot = join(root, 'shell_snapshots');
    const walk = async (directory) => {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        }
        catch {
            return;
        }
        await Promise.all(entries.map(async (entry) => {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                await walk(path);
                return;
            }
            try {
                const original = await readFile(path, 'utf8');
                const scrubbed = redact(original, secrets);
                if (scrubbed !== original)
                    await writeFile(path, scrubbed, 'utf8');
            }
            catch {
                // Snapshot files can disappear while Codex rotates them.
            }
        }));
    };
    await walk(snapshotRoot);
}
function createSecretScrubber(root, secrets) {
    if (root === undefined || secrets.length === 0)
        return { stop: async () => { } };
    let running;
    const scrub = () => {
        if (running !== undefined)
            return running;
        running = scrubSecretFiles(root, secrets).finally(() => { running = undefined; });
        return running;
    };
    const timer = setInterval(() => { void scrub(); }, 100);
    timer.unref?.();
    void scrub();
    let stopPromise;
    return {
        stop: () => {
            if (stopPromise !== undefined)
                return stopPromise;
            clearInterval(timer);
            stopPromise = scrub();
            return stopPromise;
        },
    };
}
function childProcessEnvironment(overrides) {
    const env = childEnvironment(overrides);
    for (const key of processEnvironmentSecretKeys()) {
        if (overrides?.[key] === undefined)
            delete env[key];
    }
    return env;
}
function disposeGraceMs(value) {
    const graceMs = value ?? DEFAULT_DISPOSE_GRACE_MS;
    if (!Number.isFinite(graceMs) || graceMs < 0)
        throw new Error('Codex dispose grace must be a finite non-negative number');
    return graceMs;
}
/** Owns one Codex app-server process and its complete teardown. */
export class CodexProcess {
    options;
    scrubber;
    child;
    stderr = '';
    stderrPending = '';
    redactions;
    exitObservedPromise;
    closePromise;
    terminationPromise;
    scrubberStopPromise;
    exitObserved = false;
    closeObserved = false;
    terminated = false;
    streamError;
    disposePromise;
    constructor(child, options, scrubber) {
        this.options = options;
        this.scrubber = scrubber;
        this.child = child;
        this.redactions = options.redactions;
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => this.appendStderr(String(chunk)));
        child.stderr.on('end', () => this.flushStderr());
        const observeStreamError = (value) => {
            if (this.streamError !== undefined)
                return;
            const error = value instanceof Error ? value : new Error(String(value));
            this.streamError = this.redactError(error);
        };
        child.stderr.on('error', observeStreamError);
        child.stdin.on('error', observeStreamError);
        let resolveExit;
        this.exitObservedPromise = new Promise(resolve => { resolveExit = resolve; });
        let resolveClose;
        this.closePromise = new Promise(resolve => { resolveClose = resolve; });
        const observeExit = (code, signal, error) => {
            if (this.exitObserved)
                return;
            this.exitObserved = true;
            const observedError = error ?? this.streamError;
            resolveExit({ code, signal, ...observedError === undefined ? {} : { error: observedError } });
        };
        const observeClose = () => {
            if (this.closeObserved)
                return;
            this.closeObserved = true;
            this.flushStderr();
            resolveClose();
        };
        child.once('error', value => {
            const error = value instanceof Error ? value : new Error(String(value));
            observeExit(null, null, this.redactError(error));
            // A spawn failure has no child process to wait for. ChildProcess normally
            // emits close as well, but resolving here keeps the failed start deterministic.
            observeClose();
        });
        child.once('exit', (code, signal) => observeExit(code, signal));
        child.once('close', observeClose);
        this.terminationPromise = Promise.all([this.exitObservedPromise, this.closePromise]).then(([exit]) => {
            this.flushStderr();
            this.terminated = true;
            return {
                ...exit,
                stderr: this.stderr,
            };
        });
        this.scrubberStopPromise = this.terminationPromise.then(() => this.scrubber.stop());
    }
    static start(options) {
        const executable = options.executable ?? 'codex';
        const args = [...options.args ?? ['app-server', '--listen', 'stdio://']];
        const graceMs = disposeGraceMs(options.disposeGraceMs);
        const redactions = normalizeRedactions(options.redactions);
        const child = spawn(executable, args, {
            cwd: options.cwd,
            env: childProcessEnvironment(options.env),
            shell: false,
            detached: process.platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return new CodexProcess(child, {
            disposeGraceMs: graceMs,
            redactions,
        }, createSecretScrubber(options.env?.['CODEX_HOME'], redactions));
    }
    get stdin() { return this.child.stdin; }
    get stdout() { return this.child.stdout; }
    get stderrStream() { return this.child.stderr; }
    get stderrTail() { return this.stderr; }
    get exited() { return this.terminationPromise; }
    /** Explicit child-process signals are kept separate from the idempotent close path. */
    kill(signal) {
        if (this.exitObserved || this.terminated)
            return false;
        return killProcessTree(this.child, signal);
    }
    async dispose() {
        if (this.disposePromise !== undefined)
            return this.disposePromise;
        this.disposePromise = this.disposeOnce();
        return this.disposePromise;
    }
    async close() {
        return this.dispose();
    }
    async disposeOnce() {
        if (this.exitObserved || this.terminated)
            return this.disposedResult();
        if (!this.child.stdin.destroyed && !this.child.stdin.writableEnded)
            this.child.stdin.end();
        const graceful = await this.waitForTermination(this.options.disposeGraceMs);
        if (graceful !== undefined)
            return this.disposedResult();
        if (this.exitObserved || this.terminated)
            return this.disposedResult();
        killProcessTree(this.child, 'SIGTERM');
        await new Promise(resolve => { setTimeout(resolve, this.options.disposeGraceMs); });
        killProcessTree(this.child, 'SIGKILL');
        this.child.stdin.destroy();
        this.child.stdout.destroy();
        this.child.stderr.destroy();
        return this.disposedResult();
    }
    async disposedResult() {
        const [exit] = await Promise.all([this.terminationPromise, this.scrubberStopPromise]);
        return exit;
    }
    appendStderr(chunk) {
        if (this.redactions.length === 0) {
            this.stderr = appendTail(this.stderr, chunk);
            return;
        }
        this.stderrPending += chunk;
        const safeLength = this.stderrPending.length - pendingSecretPrefixLength(this.stderrPending, this.redactions);
        if (safeLength <= 0)
            return;
        this.stderr = appendTail(this.stderr, redact(this.stderrPending.slice(0, safeLength), this.redactions));
        this.stderrPending = this.stderrPending.slice(safeLength);
    }
    flushStderr() {
        if (this.stderrPending.length === 0)
            return;
        this.stderr = appendTail(this.stderr, redact(this.stderrPending, this.redactions));
        this.stderrPending = '';
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
export async function waitForProcessExit(process) {
    return process.exited;
}
export async function waitForChildClose(child) {
    await once(child, 'close');
}
export function processEnvironmentSecretKeys() {
    return [
        'OPENAI_API_KEY',
        'CODEX_API_KEY',
        'DSH_DEBUG_CODEX_API_KEY',
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
    ];
}
//# sourceMappingURL=process.js.map