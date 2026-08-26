export class CatalogError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'CatalogError';
        this.code = code;
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readSdkSlashCommand(value) {
    if (!isRecord(value))
        return undefined;
    const name = value['name'];
    const description = value['description'];
    const argumentHint = value['argumentHint'];
    const aliases = value['aliases'];
    if (typeof name !== 'string' || typeof description !== 'string' || typeof argumentHint !== 'string')
        return undefined;
    if (aliases !== undefined && (!Array.isArray(aliases) || !aliases.every(item => typeof item === 'string')))
        return undefined;
    if (aliases === undefined)
        return { name, description, argumentHint };
    const aliasValues = [];
    for (const alias of aliases) {
        if (typeof alias !== 'string')
            return undefined;
        aliasValues.push(alias);
    }
    return { name, description, argumentHint, aliases: aliasValues };
}
function isEffortLevel(value) {
    return value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max';
}
function readSdkModel(value) {
    if (!isRecord(value))
        return undefined;
    const modelValue = value['value'];
    const displayName = value['displayName'];
    const description = value['description'];
    const resolvedModel = value['resolvedModel'];
    const supportsEffort = value['supportsEffort'];
    const supportedEffortLevels = value['supportedEffortLevels'];
    const supportsAdaptiveThinking = value['supportsAdaptiveThinking'];
    const supportsFastMode = value['supportsFastMode'];
    const supportsAutoMode = value['supportsAutoMode'];
    if (typeof modelValue !== 'string' || typeof displayName !== 'string' || typeof description !== 'string')
        return undefined;
    if (resolvedModel !== undefined && typeof resolvedModel !== 'string')
        return undefined;
    if (supportsEffort !== undefined && typeof supportsEffort !== 'boolean')
        return undefined;
    if (supportedEffortLevels !== undefined && (!Array.isArray(supportedEffortLevels) || !supportedEffortLevels.every(isEffortLevel)))
        return undefined;
    if (supportsAdaptiveThinking !== undefined && typeof supportsAdaptiveThinking !== 'boolean')
        return undefined;
    if (supportsFastMode !== undefined && typeof supportsFastMode !== 'boolean')
        return undefined;
    if (supportsAutoMode !== undefined && typeof supportsAutoMode !== 'boolean')
        return undefined;
    return {
        value: modelValue,
        ...(resolvedModel === undefined ? {} : { resolvedModel }),
        displayName,
        description,
        ...(supportsEffort === undefined ? {} : { supportsEffort }),
        ...(supportedEffortLevels === undefined ? {} : { supportedEffortLevels: supportedEffortLevels.filter(isEffortLevel) }),
        ...(supportsAdaptiveThinking === undefined ? {} : { supportsAdaptiveThinking }),
        ...(supportsFastMode === undefined ? {} : { supportsFastMode }),
        ...(supportsAutoMode === undefined ? {} : { supportsAutoMode }),
    };
}
export function mapSdkSlashCommand(command) {
    const fields = readSdkSlashCommand(command);
    if (fields === undefined)
        throw new CatalogError('invalid_result', 'SDK returned an invalid slash command');
    const aliases = fields.aliases === undefined ? [] : [...fields.aliases];
    return Object.freeze({ name: fields.name, id: fields.name, displayName: fields.name, description: fields.description, argumentHint: fields.argumentHint, aliases: Object.freeze(aliases) });
}
export function mapSdkModel(model) {
    const fields = readSdkModel(model);
    if (fields === undefined)
        throw new CatalogError('invalid_result', 'SDK returned an invalid model');
    return Object.freeze({
        id: fields.value,
        value: fields.value,
        ...(fields.resolvedModel === undefined ? {} : { resolvedModel: fields.resolvedModel }),
        displayName: fields.displayName,
        description: fields.description,
        ...(fields.supportsEffort === undefined ? {} : { supportsEffort: fields.supportsEffort }),
        ...(fields.supportedEffortLevels === undefined ? {} : { supportedEffortLevels: Object.freeze([...fields.supportedEffortLevels]) }),
        ...(fields.supportsAdaptiveThinking === undefined ? {} : { supportsAdaptiveThinking: fields.supportsAdaptiveThinking }),
        ...(fields.supportsFastMode === undefined ? {} : { supportsFastMode: fields.supportsFastMode }),
        ...(fields.supportsAutoMode === undefined ? {} : { supportsAutoMode: fields.supportsAutoMode }),
    });
}
async function runDiscovery(discovery, options) {
    if (discovery === undefined)
        return { status: 'not_provided' };
    if (options.signal?.aborted)
        return { status: 'failure', error: new CatalogError('aborted', 'Discovery was aborted') };
    let timeoutHandle;
    let abortListener;
    try {
        const operation = discovery(options.signal);
        const cancellation = new Promise((_, reject) => {
            abortListener = () => reject(new CatalogError('aborted', 'Discovery was aborted'));
            options.signal?.addEventListener('abort', abortListener, { once: true });
            if (options.timeoutMs !== undefined)
                timeoutHandle = setTimeout(() => reject(new CatalogError('timeout', 'Discovery timed out')), Math.max(0, options.timeoutMs));
        });
        const value = await (options.signal === undefined && options.timeoutMs === undefined ? operation : Promise.race([operation, cancellation]));
        if (!Array.isArray(value))
            throw new CatalogError('invalid_result', 'Discovery returned an invalid value');
        return { status: 'ok', value: Object.freeze([...value]) };
    }
    catch (error) {
        if (error instanceof CatalogError)
            return { status: 'failure', error };
        if (error instanceof Error)
            return { status: 'failure', error: new CatalogError('query_failed', error.message, { cause: error }) };
        return { status: 'failure', error: new CatalogError('query_failed', 'Discovery failed', { cause: error }) };
    }
    finally {
        if (timeoutHandle !== undefined)
            clearTimeout(timeoutHandle);
        if (options.signal !== undefined && abortListener !== undefined)
            options.signal.removeEventListener('abort', abortListener);
    }
}
export function discoverModes(discovery, options = {}) { return runDiscovery(discovery, options); }
export function discoverThinking(discovery, options = {}) { return runDiscovery(discovery, options); }
function queryError(error) {
    if (error instanceof CatalogError)
        return error;
    if (error instanceof Error)
        return new CatalogError('query_failed', error.message, { cause: error });
    return new CatalogError('query_failed', 'Catalog query failed', { cause: error });
}
export class ClaudeCatalogCache {
    query;
    ttlMs;
    clock;
    commandsEntry;
    modelsEntry;
    commandsGeneration = 0;
    modelsGeneration = 0;
    commandsVersion = 0;
    modelsVersion = 0;
    commandsOperation;
    modelsOperation;
    closed = false;
    constructor(query, options = {}) {
        this.query = query;
        this.ttlMs = options.ttlMs ?? 30_000;
        this.clock = options.clock ?? (() => Date.now());
    }
    loadCommands(options = {}) {
        if (this.closed)
            return Promise.resolve({ status: 'failure', error: new CatalogError('closed', 'Catalog cache is closed'), version: this.commandsVersion, stale: false });
        if (options.signal?.aborted)
            return Promise.resolve({ status: 'failure', error: new CatalogError('aborted', 'Catalog load was aborted'), version: this.commandsVersion, stale: false });
        if (!options.force && this.commandsEntry !== undefined && this.clock() - this.commandsEntry.loadedAt < this.ttlMs)
            return Promise.resolve({ status: 'ok', value: this.commandsEntry.value, version: this.commandsEntry.version, stale: false });
        const operation = this.commandsOperation ?? this.startCommands();
        return this.waitCommands(operation, options);
    }
    loadModels(options = {}) {
        if (this.closed)
            return Promise.resolve({ status: 'failure', error: new CatalogError('closed', 'Catalog cache is closed'), version: this.modelsVersion, stale: false });
        if (options.signal?.aborted)
            return Promise.resolve({ status: 'failure', error: new CatalogError('aborted', 'Catalog load was aborted'), version: this.modelsVersion, stale: false });
        if (!options.force && this.modelsEntry !== undefined && this.clock() - this.modelsEntry.loadedAt < this.ttlMs)
            return Promise.resolve({ status: 'ok', value: this.modelsEntry.value, version: this.modelsEntry.version, stale: false });
        const operation = this.modelsOperation ?? this.startModels();
        return this.waitModels(operation, options);
    }
    async loadAll(options = {}) {
        const [commands, models] = await Promise.all([this.loadCommands(options), this.loadModels(options)]);
        return Object.freeze({ commands, models });
    }
    invalidate(kind) {
        if (kind === undefined || kind === 'commands') {
            this.commandsGeneration += 1;
            this.commandsEntry = undefined;
            this.commandsOperation = undefined;
        }
        if (kind === undefined || kind === 'models') {
            this.modelsGeneration += 1;
            this.modelsEntry = undefined;
            this.modelsOperation = undefined;
        }
    }
    close() { this.closed = true; this.invalidate(); }
    startCommands() {
        const operation = { generation: this.commandsGeneration, promise: this.fetchCommands(this.commandsGeneration) };
        this.commandsOperation = operation;
        void operation.promise.finally(() => { if (this.commandsOperation === operation)
            this.commandsOperation = undefined; }).catch(() => undefined);
        return operation;
    }
    startModels() {
        const operation = { generation: this.modelsGeneration, promise: this.fetchModels(this.modelsGeneration) };
        this.modelsOperation = operation;
        void operation.promise.finally(() => { if (this.modelsOperation === operation)
            this.modelsOperation = undefined; }).catch(() => undefined);
        return operation;
    }
    async fetchCommands(generation) {
        try {
            const raw = await this.query.supportedCommands();
            const value = Object.freeze(raw.map(mapSdkSlashCommand));
            if (generation !== this.commandsGeneration || this.closed)
                return { status: 'ok', value, version: this.commandsVersion, stale: false };
            const version = ++this.commandsVersion;
            this.commandsEntry = { value, version, loadedAt: this.clock() };
            return { status: 'ok', value, version, stale: false };
        }
        catch (error) {
            return this.commandFailure(queryError(error));
        }
    }
    async fetchModels(generation) {
        try {
            const raw = await this.query.supportedModels();
            const value = Object.freeze(raw.map(mapSdkModel));
            if (generation !== this.modelsGeneration || this.closed)
                return { status: 'ok', value, version: this.modelsVersion, stale: false };
            const version = ++this.modelsVersion;
            this.modelsEntry = { value, version, loadedAt: this.clock() };
            return { status: 'ok', value, version, stale: false };
        }
        catch (error) {
            return this.modelFailure(queryError(error));
        }
    }
    commandFailure(error) {
        if (this.commandsEntry === undefined)
            return { status: 'failure', error, version: this.commandsVersion, stale: false };
        return { status: 'failure', error, version: this.commandsEntry.version, stale: true, value: this.commandsEntry.value };
    }
    modelFailure(error) {
        if (this.modelsEntry === undefined)
            return { status: 'failure', error, version: this.modelsVersion, stale: false };
        return { status: 'failure', error, version: this.modelsEntry.version, stale: true, value: this.modelsEntry.value };
    }
    async waitCommands(operation, options) {
        let timeoutHandle;
        let abortListener;
        try {
            const cancellation = new Promise((_, reject) => {
                abortListener = () => reject(new CatalogError('aborted', 'Catalog load was aborted'));
                options.signal?.addEventListener('abort', abortListener, { once: true });
                if (options.timeoutMs !== undefined)
                    timeoutHandle = setTimeout(() => reject(new CatalogError('timeout', 'Catalog load timed out')), Math.max(0, options.timeoutMs));
            });
            return await (options.signal === undefined && options.timeoutMs === undefined ? operation.promise : Promise.race([operation.promise, cancellation]));
        }
        catch (error) {
            if (this.commandsOperation === operation && error instanceof CatalogError && (error.code === 'aborted' || error.code === 'timeout')) {
                this.commandsOperation = undefined;
                this.commandsGeneration += 1;
            }
            return this.commandFailure(error instanceof CatalogError ? error : queryError(error));
        }
        finally {
            if (timeoutHandle !== undefined)
                clearTimeout(timeoutHandle);
            if (options.signal !== undefined && abortListener !== undefined)
                options.signal.removeEventListener('abort', abortListener);
        }
    }
    async waitModels(operation, options) {
        let timeoutHandle;
        let abortListener;
        try {
            const cancellation = new Promise((_, reject) => {
                abortListener = () => reject(new CatalogError('aborted', 'Catalog load was aborted'));
                options.signal?.addEventListener('abort', abortListener, { once: true });
                if (options.timeoutMs !== undefined)
                    timeoutHandle = setTimeout(() => reject(new CatalogError('timeout', 'Catalog load timed out')), Math.max(0, options.timeoutMs));
            });
            return await (options.signal === undefined && options.timeoutMs === undefined ? operation.promise : Promise.race([operation.promise, cancellation]));
        }
        catch (error) {
            if (this.modelsOperation === operation && error instanceof CatalogError && (error.code === 'aborted' || error.code === 'timeout')) {
                this.modelsOperation = undefined;
                this.modelsGeneration += 1;
            }
            return this.modelFailure(error instanceof CatalogError ? error : queryError(error));
        }
        finally {
            if (timeoutHandle !== undefined)
                clearTimeout(timeoutHandle);
            if (options.signal !== undefined && abortListener !== undefined)
                options.signal.removeEventListener('abort', abortListener);
        }
    }
}
//# sourceMappingURL=catalog.js.map