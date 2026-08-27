import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, dirname, join, resolve } from 'node:path';
/** Current durable on-disk schema version for Engine Suite session bindings. */
export const EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION = 2;
const fileLocks = new Map();
const currentBindingKeys = ['sessionId', 'engineId', 'nativeSessionId', 'runtimeRoot', 'selection', 'executable', 'args'];
const legacyBindingKeys = [...currentBindingKeys, 'threadId'];
const selectionKeys = ['engineId', 'providerId', 'modelRecordId', 'reasoningEffort'];
const credentialArgumentPattern = /(?:^|[-_=:])(api[-_]?key|access[-_]?token|auth(?:entication)?[-_]?token|credential|password|secret|authorization)(?:$|[-_=:])/iu;
function nextLockTurn() {
    return new Promise(resolveCurrent => setImmediate(resolveCurrent));
}
/** Acquire an OS-visible lock after the process-local queue has serialized callers in this process. */
async function acquireFileLock(file) {
    const lockFile = `${file}.lock`;
    await mkdir(dirname(file), { recursive: true });
    while (true) {
        let handle;
        try {
            handle = await open(lockFile, 'wx', 0o600);
            await handle.writeFile(`${process.pid}\n`, 'utf8');
            return async () => {
                await handle.close();
                await unlink(lockFile).catch((error) => {
                    if (error.code !== 'ENOENT')
                        throw error;
                });
            };
        }
        catch (error) {
            await handle?.close().catch(() => undefined);
            if (error.code !== 'EEXIST')
                throw error;
            try {
                const owner = Number((await readFile(lockFile, 'utf8')).trim());
                if (Number.isSafeInteger(owner) && owner > 0)
                    process.kill(owner, 0);
            }
            catch (ownerError) {
                if (ownerError.code === 'ESRCH') {
                    await unlink(lockFile).catch((unlinkError) => {
                        if (unlinkError.code !== 'ENOENT')
                            throw unlinkError;
                    });
                    continue;
                }
            }
            await nextLockTurn();
        }
    }
}
/** Serializes binding read-modify-write transactions across store instances and processes. */
async function withFileLock(file, operation) {
    const previous = fileLocks.get(file);
    let releaseProcess;
    const current = new Promise(resolveCurrent => { releaseProcess = resolveCurrent; });
    fileLocks.set(file, current);
    await previous?.catch(() => undefined);
    let releaseFile;
    try {
        releaseFile = await acquireFileLock(file);
        return await operation();
    }
    finally {
        try {
            await releaseFile?.();
        }
        finally {
            releaseProcess();
            if (fileLocks.get(file) === current)
                fileLocks.delete(file);
        }
    }
}
function homeRoot() {
    return process.env['DSH_ENGINE_SUITE_HOME']
        ?? join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'engine-suite');
}
function object(value, label) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value;
}
function text(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new Error(`${label} must be a non-empty string`);
    return value;
}
function exactKeys(value, allowed, label) {
    const accepted = new Set(allowed);
    for (const key of Object.keys(value)) {
        if (!accepted.has(key))
            throw new Error(`${label} must not declare ${key}`);
    }
}
function optionalText(value, label) {
    if (value === undefined)
        return undefined;
    return text(value, label);
}
function optionalArgs(value, label) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value))
        throw new Error(`${label} must be an array`);
    const args = value.map((argument, index) => text(argument, `${label}[${index}]`));
    for (const [index, argument] of args.entries()) {
        if (credentialArgumentPattern.test(argument)) {
            throw new Error(`${label}[${index}] must not carry credentials`);
        }
    }
    return args;
}
function normalizeSelection(value, label) {
    const selection = object(value, label);
    exactKeys(selection, selectionKeys, label);
    const reasoningEffort = optionalText(selection['reasoningEffort'], `${label}.reasoningEffort`);
    return {
        engineId: text(selection['engineId'], `${label}.engineId`),
        providerId: text(selection['providerId'], `${label}.providerId`),
        modelRecordId: text(selection['modelRecordId'], `${label}.modelRecordId`),
        ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    };
}
function normalizeBinding(value, legacy) {
    const candidate = object(value, 'binding');
    exactKeys(candidate, legacy ? legacyBindingKeys : currentBindingKeys, 'binding');
    const sessionId = text(candidate['sessionId'], 'binding.sessionId');
    const engineId = text(candidate['engineId'] ?? (legacy ? 'codex-cli' : undefined), 'binding.engineId');
    const nativeSessionId = text(candidate['nativeSessionId'] ?? (legacy ? candidate['threadId'] : undefined), 'binding.nativeSessionId');
    const runtimeRoot = text(candidate['runtimeRoot'], 'binding.runtimeRoot');
    if (!isAbsolute(runtimeRoot))
        throw new Error('binding.runtimeRoot must be an absolute path');
    const selection = normalizeSelection(candidate['selection'], 'binding.selection');
    if (selection.engineId !== engineId) {
        throw new Error(`binding engine does not match selection: ${engineId} !== ${selection.engineId}`);
    }
    const executable = optionalText(candidate['executable'], 'binding.executable');
    const args = optionalArgs(candidate['args'], 'binding.args');
    return {
        sessionId,
        engineId,
        nativeSessionId,
        runtimeRoot,
        selection,
        ...(executable === undefined ? {} : { executable }),
        ...(args === undefined ? {} : { args: [...args] }),
    };
}
function normalizeDocument(value) {
    const document = object(value, 'binding document');
    exactKeys(document, ['version', 'bindings'], 'binding document');
    if (!Array.isArray(document['bindings']))
        throw new Error('binding document.bindings must be an array');
    if (document['version'] === 1) {
        return {
            version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION,
            bindings: document['bindings'].map(binding => normalizeBinding(binding, true)),
        };
    }
    if (document['version'] !== EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION) {
        throw new Error(`unsupported binding document version: ${String(document['version'])}`);
    }
    return {
        version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION,
        bindings: document['bindings'].map(binding => normalizeBinding(binding, false)),
    };
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
        return withFileLock(this.file, async () => {
            const document = await this.read();
            return document.bindings.find(binding => binding.sessionId === sessionId);
        });
    }
    async put(binding) {
        const normalized = normalizeBinding(binding, false);
        await withFileLock(this.file, async () => {
            const document = await this.read();
            const bindings = document.bindings.filter(candidate => candidate.sessionId !== normalized.sessionId);
            bindings.push(normalized);
            await this.write({ version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION, bindings });
        });
    }
    async remove(sessionId) {
        await withFileLock(this.file, async () => {
            const document = await this.read();
            const bindings = document.bindings.filter(binding => binding.sessionId !== sessionId);
            if (bindings.length === document.bindings.length)
                return;
            await this.write({ version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION, bindings });
        });
    }
    async read() {
        try {
            return normalizeDocument(JSON.parse(await readFile(this.file, 'utf8')));
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return { version: EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION, bindings: [] };
            }
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