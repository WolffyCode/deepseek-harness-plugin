import { homedir } from 'node:os';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
function defaultFile() {
    return join(process.env['DSH_ENGINE_SUITE_HOME'] ?? join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'engine-suite'), 'parent-child-lineage.json');
}
function text(value, name) {
    const normalized = value.trim();
    if (normalized.length === 0)
        throw new TypeError(`${name} must be non-empty`);
    return normalized;
}
function validateDescriptor(input) {
    if (!Number.isSafeInteger(input.depth) || input.depth < 1)
        throw new RangeError('lineage depth must be a positive safe integer');
    if (input.status !== 'running' && input.status !== 'completed' && input.status !== 'failed' && input.status !== 'canceled' && input.status !== 'archived' && input.status !== 'detached')
        throw new TypeError('invalid lineage status');
    return {
        parentSessionId: text(input.parentSessionId, 'parentSessionId'),
        nativeTaskId: text(input.nativeTaskId, 'nativeTaskId'),
        childSessionId: text(input.childSessionId, 'childSessionId'),
        depth: input.depth,
        profile: text(input.profile, 'profile'),
        status: input.status,
        ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
        ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
    };
}
function validateAfterSequence(value) {
    if (value === undefined)
        return 0;
    if (!Number.isSafeInteger(value) || value < 0)
        throw new RangeError('afterSequence must be a non-negative safe integer');
    return value;
}
function terminalStatus(type) {
    if (type === 'result')
        return 'completed';
    if (type === 'error')
        return 'failed';
    if (type === 'cancel')
        return 'canceled';
    return undefined;
}
function isFileMissing(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
export function createParentChildLineageStore(file = defaultFile(), initial) {
    const descriptors = new Map();
    const events = new Map();
    const nextSequences = new Map();
    const listeners = new Map();
    let writes = Promise.resolve();
    const persist = () => {
        if (file.length === 0)
            return writes;
        const document = {
            version: 1,
            descriptors: [...descriptors.values()],
            events: [...events.values()].flat(),
        };
        const body = `${JSON.stringify(document, null, 2)}\n`;
        const operation = writes.then(async () => {
            await mkdir(dirname(file), { recursive: true });
            const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
            await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 });
            await rename(temporary, file);
        }, async () => {
            await mkdir(dirname(file), { recursive: true });
            const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
            await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 });
            await rename(temporary, file);
        });
        writes = operation.catch(() => { });
        return operation;
    };
    for (const descriptor of initial?.descriptors ?? []) {
        const valid = validateDescriptor(descriptor);
        descriptors.set(valid.childSessionId, valid);
    }
    for (const event of initial?.events ?? []) {
        if (!Number.isSafeInteger(event.sequence) || event.sequence < 1)
            throw new RangeError('lineage event sequence must be positive');
        const list = events.get(event.parentSessionId) ?? [];
        list.push({ ...event });
        events.set(event.parentSessionId, list);
        nextSequences.set(event.parentSessionId, Math.max(nextSequences.get(event.parentSessionId) ?? 0, event.sequence));
    }
    const store = {
        create: input => {
            const descriptor = validateDescriptor(input);
            if (descriptors.has(descriptor.childSessionId))
                throw new Error(`lineage already exists for child session ${descriptor.childSessionId}`);
            const now = new Date().toISOString();
            const stored = { ...descriptor, createdAt: descriptor.createdAt ?? now, updatedAt: descriptor.updatedAt ?? now };
            descriptors.set(stored.childSessionId, stored);
            void persist();
            return { ...stored };
        },
        update: (childSessionId, patch) => {
            const id = text(childSessionId, 'childSessionId');
            const current = descriptors.get(id);
            if (current === undefined)
                throw new Error(`lineage not found for child session ${id}`);
            const stored = patch.status === undefined ? current : { ...current, status: patch.status, updatedAt: new Date().toISOString() };
            descriptors.set(id, stored);
            void persist();
            return { ...stored };
        },
        get: (parentSessionId, nativeTaskId) => {
            const parent = text(parentSessionId, 'parentSessionId');
            const task = text(nativeTaskId, 'nativeTaskId');
            const found = [...descriptors.values()].find(candidate => candidate.parentSessionId === parent && candidate.nativeTaskId === task);
            return found === undefined ? undefined : { ...found };
        },
        getByChildSessionId: childSessionId => {
            const found = descriptors.get(text(childSessionId, 'childSessionId'));
            return found === undefined ? undefined : { ...found };
        },
        list: parentSessionId => [...descriptors.values()]
            .filter(candidate => parentSessionId === undefined || candidate.parentSessionId === parentSessionId)
            .sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? ''))
            .map(descriptor => ({ ...descriptor })),
        append: input => {
            const descriptor = descriptors.get(input.childSessionId);
            if (descriptor === undefined)
                throw new Error(`lineage not found for child session ${input.childSessionId}`);
            if (descriptor.parentSessionId !== input.parentSessionId || descriptor.nativeTaskId !== input.nativeTaskId)
                throw new Error('lineage event does not match its descriptor');
            const sequence = (nextSequences.get(input.parentSessionId) ?? 0) + 1;
            nextSequences.set(input.parentSessionId, sequence);
            const event = { ...input, sequence, timestamp: input.timestamp ?? new Date().toISOString() };
            const list = events.get(input.parentSessionId) ?? [];
            list.push(event);
            events.set(input.parentSessionId, list);
            const status = terminalStatus(event.type);
            if (status !== undefined)
                descriptors.set(event.childSessionId, { ...descriptor, status, updatedAt: event.timestamp });
            for (const listener of [...listeners.get(input.parentSessionId) ?? []])
                listener({ ...event });
            void persist();
            return { ...event };
        },
        replay: (parentSessionId, afterSequence) => {
            const after = validateAfterSequence(afterSequence);
            return (events.get(parentSessionId) ?? []).filter(event => event.sequence > after).map(event => ({ ...event }));
        },
        subscribe: (parentSessionId, listener) => {
            const group = listeners.get(parentSessionId) ?? new Set();
            group.add(listener);
            listeners.set(parentSessionId, group);
            return () => {
                group.delete(listener);
                if (group.size === 0)
                    listeners.delete(parentSessionId);
            };
        },
        serialize: () => JSON.stringify({ version: 1, descriptors: [...descriptors.values()], events: [...events.values()].flat() }),
        flush: () => writes,
    };
    return store;
}
export async function loadParentChildLineageStore(file = defaultFile()) {
    try {
        const value = JSON.parse(await readFile(file, 'utf8'));
        if (value.version !== 1 || !Array.isArray(value.descriptors) || !Array.isArray(value.events))
            throw new TypeError('invalid parent-child lineage document');
        return createParentChildLineageStore(file, value);
    }
    catch (error) {
        if (isFileMissing(error))
            return createParentChildLineageStore(file);
        throw error;
    }
}
//# sourceMappingURL=lineage.js.map