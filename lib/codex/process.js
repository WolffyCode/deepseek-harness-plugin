import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { childEnvironment } from '../process-env.js';
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
                let scrubbed = original;
                for (const secret of secrets) {
                    if (secret.length > 0)
                        scrubbed = scrubbed.split(secret).join('[REDACTED]');
                }
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
    let running = false;
    const scrub = async () => {
        if (running)
            return;
        running = true;
        try {
            await scrubSecretFiles(root, secrets);
        }
        finally {
            running = false;
        }
    };
    const timer = setInterval(() => { void scrub(); }, 100);
    timer.unref?.();
    void scrub();
    return {
        stop: async () => {
            clearInterval(timer);
            await scrub();
        },
    };
}
/** Owns one Codex app-server process and its complete teardown. */
export class CodexProcess {
    options;
    scrubber;
    child;
    stderr = '';
    disposed = false;
    exitPromise;
    closePromise;
    terminationPromise;
    constructor(child, options, scrubber) {
        this.options = options;
        this.scrubber = scrubber;
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
        this.closePromise = once(child, 'close').then(() => undefined);
        this.terminationPromise = Promise.all([this.exitPromise, this.closePromise]).then(([exit]) => exit);
    }
    static start(options) {
        const executable = options.executable ?? 'codex';
        const args = [...options.args ?? ['app-server', '--listen', 'stdio://']];
        const env = childEnvironment(options.env);
        const child = spawn(executable, args, {
            cwd: options.cwd,
            env,
            shell: false,
            detached: process.platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const redactions = options.redactions ?? [];
        return new CodexProcess(child, {
            disposeGraceMs: options.disposeGraceMs ?? 3_000,
            redactions,
        }, createSecretScrubber(options.env?.['CODEX_HOME'], redactions));
    }
    get stderrTail() {
        return this.stderr;
    }
    get exited() {
        return this.exitPromise;
    }
    async dispose() {
        if (this.disposed)
            return this.terminationPromise;
        this.disposed = true;
        this.child.stdin.end();
        const first = await this.waitForTermination(this.options.disposeGraceMs);
        if (first !== undefined) {
            await this.scrubber.stop();
            return first;
        }
        killProcessTree(this.child, 'SIGTERM');
        const second = await this.waitForTermination(this.options.disposeGraceMs);
        if (second !== undefined) {
            await this.scrubber.stop();
            return second;
        }
        killProcessTree(this.child, 'SIGKILL');
        this.child.stdin.destroy();
        this.child.stdout.destroy();
        this.child.stderr.destroy();
        const result = await this.terminationPromise;
        await this.scrubber.stop();
        return result;
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