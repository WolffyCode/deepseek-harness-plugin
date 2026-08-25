import { spawn } from 'node:child_process';
import { once } from 'node:events';
function appendTail(current, chunk, maxBytes = 16_384) {
    const next = current + chunk;
    return Buffer.byteLength(next, 'utf8') <= maxBytes ? next : next.slice(-maxBytes);
}
function redact(value, redactions) {
    return redactions.reduce((result, secret) => secret.length === 0 ? result : result.split(secret).join('[REDACTED]'), value);
}
function killProcessTree(child, signal) {
    if (child.pid === undefined)
        return;
    try {
        if (process.platform !== 'win32') {
            process.kill(-child.pid, signal);
        }
        else {
            child.kill(signal);
        }
    }
    catch {
        try {
            child.kill(signal);
        }
        catch { /* already exited */ }
    }
}
/** Owns one Codex app-server process and its complete teardown. */
export class CodexProcess {
    options;
    child;
    stderr = '';
    disposed = false;
    exitPromise;
    constructor(child, options) {
        this.options = options;
        this.child = child;
        child.stderr.on('data', chunk => {
            this.stderr = appendTail(this.stderr, redact(String(chunk), options.redactions));
        });
        this.exitPromise = new Promise(resolve => {
            let error;
            child.once('error', value => { error = value instanceof Error ? value : new Error(String(value)); });
            child.once('exit', (code, signal) => resolve({
                code,
                signal,
                stderr: this.stderr,
                ...error === undefined ? {} : { error },
            }));
        });
    }
    static start(options) {
        const executable = options.executable ?? 'codex';
        const args = [...options.args ?? ['app-server', '--listen', 'stdio://']];
        const env = { ...process.env };
        for (const [key, value] of Object.entries(options.env ?? {})) {
            if (value === undefined)
                delete env[key];
            else
                env[key] = value;
        }
        const child = spawn(executable, args, {
            cwd: options.cwd,
            env,
            shell: false,
            detached: process.platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return new CodexProcess(child, {
            disposeGraceMs: options.disposeGraceMs ?? 3_000,
            redactions: options.redactions ?? [],
        });
    }
    get stderrTail() {
        return this.stderr;
    }
    get exited() {
        return this.exitPromise;
    }
    async dispose() {
        if (this.disposed)
            return this.exitPromise;
        this.disposed = true;
        this.child.stdin.end();
        const first = await Promise.race([
            this.exitPromise.then(value => ({ done: true, value })),
            new Promise(resolve => setTimeout(() => resolve({ done: false }), this.options.disposeGraceMs)),
        ]);
        if (first.done)
            return first.value;
        killProcessTree(this.child, 'SIGTERM');
        const second = await Promise.race([
            this.exitPromise.then(value => ({ done: true, value })),
            new Promise(resolve => setTimeout(() => resolve({ done: false }), this.options.disposeGraceMs)),
        ]);
        if (second.done)
            return second.value;
        killProcessTree(this.child, 'SIGKILL');
        return this.exitPromise;
    }
}
export async function waitForProcessExit(process) {
    return process.exited;
}
export async function waitForChildClose(child) {
    await once(child, 'close');
}
export function processEnvironmentSecretKeys() {
    return ['OPENAI_API_KEY', 'CODEX_API_KEY', 'DSH_DEBUG_CODEX_API_KEY'];
}
//# sourceMappingURL=process.js.map