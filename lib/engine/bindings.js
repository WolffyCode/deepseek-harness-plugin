import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
const fileLocks = new Map();
/** Serializes binding read-modify-write transactions across store instances in this process. */
async function withFileLock(file, operation) {
    const previous = fileLocks.get(file);
    let release;
    const current = new Promise(resolveCurrent => { release = resolveCurrent; });
    fileLocks.set(file, current);
    await previous?.catch(() => undefined);
    try {
        return await operation();
    }
    finally {
        release();
        if (fileLocks.get(file) === current)
            fileLocks.delete(file);
    }
}
function homeRoot() {
    return process.env['DSH_ENGINE_SUITE_HOME']
        ?? join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'engine-suite');
}
/** Durable, secret-free mapping from Harness Session to a native Engine Session and runtime root. */
export class ExternalEngineBindingStore {
    file;
    constructor(file = join(homeRoot(), 'engine-bindings.json')) {
        this.file = resolve(file);
    }
    runtimeRoot(sessionId) {
        return join(dirname(this.file), 'engine-runtime', encodeURIComponent(sessionId));
    }
    async get(sessionId) {
        const document = await this.read();
        return document.bindings.find(binding => binding.sessionId === sessionId);
    }
    async put(binding) {
        const normalized = {
            sessionId: binding.sessionId,
            engineId: binding.engineId,
            nativeSessionId: binding.nativeSessionId,
            runtimeRoot: binding.runtimeRoot,
            selection: binding.selection,
            ...binding.executable === undefined ? {} : { executable: binding.executable },
            ...binding.args === undefined ? {} : { args: [...binding.args] },
        };
        await withFileLock(this.file, async () => {
            const document = await this.read();
            const bindings = document.bindings.filter(candidate => candidate.sessionId !== normalized.sessionId);
            bindings.push(normalized);
            await this.write({ version: 1, bindings });
        });
    }
    async read() {
        try {
            const value = JSON.parse(await readFile(this.file, 'utf8'));
            if (value.version !== 1 || !Array.isArray(value.bindings))
                return { version: 1, bindings: [] };
            return {
                version: 1,
                bindings: value.bindings.filter(binding => binding !== null && typeof binding === 'object').map(binding => {
                    const candidate = binding;
                    const executable = typeof candidate.executable === 'string' && candidate.executable.trim() !== ''
                        ? candidate.executable
                        : undefined;
                    const args = Array.isArray(candidate.args) && candidate.args.every((argument) => typeof argument === 'string')
                        ? [...candidate.args]
                        : undefined;
                    return {
                        sessionId: candidate.sessionId,
                        engineId: candidate.engineId ?? 'codex-cli',
                        nativeSessionId: candidate.nativeSessionId ?? candidate.threadId ?? '',
                        runtimeRoot: candidate.runtimeRoot,
                        selection: candidate.selection,
                        ...executable === undefined ? {} : { executable },
                        ...args === undefined ? {} : { args },
                    };
                }).filter(binding => binding.nativeSessionId !== ''),
            };
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return { version: 1, bindings: [] };
            throw error;
        }
    }
    async write(document) {
        await mkdir(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, this.file);
    }
}
//# sourceMappingURL=bindings.js.map