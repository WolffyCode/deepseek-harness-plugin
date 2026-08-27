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
function executionTerminal(status) {
    return status === 'completed' || status === 'failed' || status === 'canceled' || status === 'archived' ? status : undefined;
}
function validateDescriptor(input) {
    if (!Number.isSafeInteger(input.depth) || input.depth < 1)
        throw new RangeError('lineage depth must be a positive safe integer');
    if (input.status !== 'running' && input.status !== 'completed' && input.status !== 'failed' && input.status !== 'canceled' && input.status !== 'archived' && input.status !== 'detached')
        throw new TypeError('invalid lineage status');
    const terminalStatus = input.terminalStatus ?? executionTerminal(input.status);
    if (terminalStatus !== undefined && terminalStatus !== 'completed' && terminalStatus !== 'failed' && terminalStatus !== 'canceled' && terminalStatus !== 'archived')
        throw new TypeError('invalid lineage terminal status');
    return {
        parentSessionId: text(input.parentSessionId, 'parentSessionId'),
        nativeTaskId: text(input.nativeTaskId, 'nativeTaskId'),
        childSessionId: text(input.childSessionId, 'childSessionId'),
        depth: input.depth,
        profile: text(input.profile, 'profile'),
        status: input.status,
        ...(terminalStatus === undefined ? {} : { terminalStatus }),
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
function isFileMissing(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
function cloneDescriptor(descriptor) {
    return { ...descriptor };
}
function cloneEvent(event) {
    return { ...event };
}
function eventTerminalStatus(type) {
    if (type === 'result')
        return 'completed';
    if (type === 'failure')
        return 'failed';
    if (type === 'cancel')
        return 'canceled';
    if (type === 'archive')
        return 'archived';
    return undefined;
}
function transitionDescriptor(current, type, timestamp) {
    const terminal = eventTerminalStatus(type);
    if (type === 'create')
        return cloneDescriptor(current);
    if (type === 'start') {
        if (current.status !== 'running' || current.terminalStatus !== undefined)
            throw new Error(`cannot start lineage in ${current.status} state`);
        return { ...current, updatedAt: timestamp };
    }
    if (type === 'progress') {
        if ((current.status !== 'running' && current.status !== 'detached') || current.terminalStatus !== undefined)
            throw new Error(`cannot append progress to ${current.status} lineage`);
        return { ...current, updatedAt: timestamp };
    }
    if (type === 'resume') {
        if (current.status === 'archived')
            throw new Error('cannot resume archived lineage');
        const { terminalStatus: _terminalStatus, ...active } = current;
        return { ...active, status: 'running', updatedAt: timestamp };
    }
    if (type === 'detach') {
        if (current.status === 'archived')
            throw new Error('cannot detach archived lineage');
        return { ...current, status: 'detached', updatedAt: timestamp };
    }
    if (type === 'archive') {
        if (current.status === 'archived')
            throw new Error('lineage is already archived');
        return { ...current, status: 'archived', terminalStatus: 'archived', updatedAt: timestamp };
    }
    if (terminal === undefined)
        throw new Error(`unsupported lineage transition ${type}`);
    if (current.terminalStatus !== undefined)
        throw new Error(`lineage is already terminal: ${current.terminalStatus}`);
    if (current.status !== 'running' && current.status !== 'detached')
        throw new Error(`cannot finish lineage in ${current.status} state`);
    return { ...current, status: terminal, terminalStatus: terminal, updatedAt: timestamp };
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
        if (descriptors.has(valid.childSessionId))
            throw new Error(`duplicate lineage descriptor for child session ${valid.childSessionId}`);
        descriptors.set(valid.childSessionId, valid);
    }
    for (const event of initial?.events ?? []) {
        if (!Number.isSafeInteger(event.sequence) || event.sequence < 1)
            throw new RangeError('lineage event sequence must be positive');
        const parentSessionId = text(event.parentSessionId, 'parentSessionId');
        const nativeTaskId = text(event.nativeTaskId, 'nativeTaskId');
        const childSessionId = text(event.childSessionId, 'childSessionId');
        if (event.type !== 'create' && event.type !== 'start' && event.type !== 'progress' && event.type !== 'result' && event.type !== 'failure' && event.type !== 'cancel' && event.type !== 'archive' && event.type !== 'detach' && event.type !== 'resume')
            throw new TypeError('invalid lineage event type');
        const descriptor = descriptors.get(childSessionId);
        if (descriptor === undefined || descriptor.parentSessionId !== parentSessionId || descriptor.nativeTaskId !== nativeTaskId)
            throw new Error('lineage event does not match its descriptor');
        const list = events.get(parentSessionId) ?? [];
        if (list.some(candidate => candidate.sequence === event.sequence))
            throw new Error(`duplicate lineage event sequence ${event.sequence}`);
        list.push({ ...event, parentSessionId, nativeTaskId, childSessionId });
        events.set(parentSessionId, list);
        nextSequences.set(parentSessionId, Math.max(nextSequences.get(parentSessionId) ?? 0, event.sequence));
    }
    for (const list of events.values())
        list.sort((left, right) => left.sequence - right.sequence);
    for (const descriptor of [...descriptors.values()]) {
        const hasEvents = [...events.values()].some(list => list.some(event => event.childSessionId === descriptor.childSessionId));
        if (!hasEvents)
            continue;
        const { terminalStatus: _terminalStatus, ...base } = descriptor;
        descriptors.set(descriptor.childSessionId, { ...base, status: 'running', ...(descriptor.createdAt ?? descriptor.updatedAt) === undefined ? {} : { updatedAt: descriptor.createdAt ?? descriptor.updatedAt } });
    }
    for (const list of events.values()) {
        for (const event of list) {
            const current = descriptors.get(event.childSessionId);
            if (current === undefined)
                throw new Error(`lineage not found for child session ${event.childSessionId}`);
            descriptors.set(event.childSessionId, transitionDescriptor(current, event.type, event.timestamp));
        }
    }
    const appendEvent = (input) => {
        const parentSessionId = text(input.parentSessionId, 'parentSessionId');
        const nativeTaskId = text(input.nativeTaskId, 'nativeTaskId');
        const childSessionId = text(input.childSessionId, 'childSessionId');
        const descriptor = descriptors.get(childSessionId);
        if (descriptor === undefined)
            throw new Error(`lineage not found for child session ${childSessionId}`);
        if (descriptor.parentSessionId !== parentSessionId || descriptor.nativeTaskId !== nativeTaskId)
            throw new Error('lineage event does not match its descriptor');
        const priorEvents = events.get(parentSessionId) ?? [];
        if (input.type === 'create' && priorEvents.some(event => event.childSessionId === childSessionId && event.type === 'create'))
            throw new Error(`lineage was already created for child session ${childSessionId}`);
        const timestamp = input.timestamp ?? new Date().toISOString();
        const nextDescriptor = transitionDescriptor(descriptor, input.type, timestamp);
        const sequence = (nextSequences.get(parentSessionId) ?? 0) + 1;
        const event = { ...input, parentSessionId, nativeTaskId, childSessionId, sequence, timestamp };
        const list = events.get(parentSessionId) ?? [];
        list.push(event);
        events.set(parentSessionId, list);
        nextSequences.set(parentSessionId, sequence);
        descriptors.set(childSessionId, nextDescriptor);
        for (const listener of [...listeners.get(parentSessionId) ?? []])
            listener(cloneEvent(event));
        void persist();
        return cloneEvent(event);
    };
    const store = {
        create: input => {
            const descriptor = validateDescriptor(input);
            if (descriptors.has(descriptor.childSessionId))
                throw new Error(`lineage already exists for child session ${descriptor.childSessionId}`);
            const now = new Date().toISOString();
            const stored = {
                parentSessionId: descriptor.parentSessionId,
                nativeTaskId: descriptor.nativeTaskId,
                childSessionId: descriptor.childSessionId,
                depth: descriptor.depth,
                profile: descriptor.profile,
                status: 'running',
                createdAt: descriptor.createdAt ?? now,
                updatedAt: descriptor.updatedAt ?? now,
            };
            // A newly created descriptor is always an active delegation run.
            const withoutUndefined = stored;
            descriptors.set(withoutUndefined.childSessionId, withoutUndefined);
            appendEvent({ parentSessionId: withoutUndefined.parentSessionId, nativeTaskId: withoutUndefined.nativeTaskId, childSessionId: withoutUndefined.childSessionId, type: 'create', ...withoutUndefined.createdAt === undefined ? {} : { timestamp: withoutUndefined.createdAt } });
            return cloneDescriptor(descriptors.get(withoutUndefined.childSessionId));
        },
        update: (childSessionId, patch) => {
            const id = text(childSessionId, 'childSessionId');
            const current = descriptors.get(id);
            if (current === undefined)
                throw new Error(`lineage not found for child session ${id}`);
            if (patch.status === undefined || patch.status === current.status)
                return cloneDescriptor(current);
            const type = patch.status === 'running'
                ? 'resume'
                : patch.status === 'completed'
                    ? 'result'
                    : patch.status === 'failed'
                        ? 'failure'
                        : patch.status === 'canceled'
                            ? 'cancel'
                            : patch.status === 'archived'
                                ? 'archive'
                                : 'detach';
            appendEvent({ parentSessionId: current.parentSessionId, nativeTaskId: current.nativeTaskId, childSessionId: id, type });
            return cloneDescriptor(descriptors.get(id));
        },
        get: (parentSessionId, nativeTaskId) => {
            const parent = text(parentSessionId, 'parentSessionId');
            const task = text(nativeTaskId, 'nativeTaskId');
            const found = [...descriptors.values()].find(candidate => candidate.parentSessionId === parent && candidate.nativeTaskId === task);
            return found === undefined ? undefined : cloneDescriptor(found);
        },
        getByChildSessionId: childSessionId => {
            const found = descriptors.get(text(childSessionId, 'childSessionId'));
            return found === undefined ? undefined : cloneDescriptor(found);
        },
        list: parentSessionId => [...descriptors.values()]
            .filter(candidate => parentSessionId === undefined || candidate.parentSessionId === parentSessionId)
            .sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? ''))
            .map(cloneDescriptor),
        append: appendEvent,
        replay: (parentSessionId, afterSequence) => {
            const parent = text(parentSessionId, 'parentSessionId');
            const after = validateAfterSequence(afterSequence);
            return (events.get(parent) ?? []).filter(event => event.sequence > after).map(cloneEvent);
        },
        subscribe: (parentSessionId, listener) => {
            const parent = text(parentSessionId, 'parentSessionId');
            const group = listeners.get(parent) ?? new Set();
            group.add(listener);
            listeners.set(parent, group);
            return () => {
                group.delete(listener);
                if (group.size === 0)
                    listeners.delete(parent);
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