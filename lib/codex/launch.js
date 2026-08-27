import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexRuntime } from './runtime.js';
import { renderCodexConfig, resolveCodexMcpEnvironment } from './config.js';
function asError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
function memoizedCredentialResolver(resolver) {
    const pending = new Map();
    return reference => {
        const existing = pending.get(reference);
        if (existing !== undefined)
            return existing;
        const next = Promise.resolve().then(() => resolver(reference));
        pending.set(reference, next);
        return next;
    };
}
function assertMcpEnvironmentDoesNotShadowLaunchEnvironment(mcpEnvironment, environment) {
    for (const key of Object.keys(mcpEnvironment)) {
        if (key === 'OPENAI_API_KEY' || key === 'CODEX_HOME') {
            throw new Error(`Codex MCP credential target is reserved by the launcher: ${key}`);
        }
        if (environment !== undefined && Object.prototype.hasOwnProperty.call(environment, key)) {
            throw new Error(`Codex MCP credential target conflicts with launch environment: ${key}`);
        }
    }
}
function validateLaunchSelection(options) {
    if (options.profile.engineId !== 'codex-cli') {
        throw new Error(`unsupported Codex profile engine: ${options.profile.engineId}`);
    }
    if (options.provider.engineId !== 'codex-cli') {
        throw new Error(`provider is not a Codex provider: ${options.provider.id}`);
    }
    if (options.provider.wireApi !== 'responses') {
        throw new Error(`Codex provider ${options.provider.id} must use the Responses API wire protocol`);
    }
    if (options.provider.authMode !== 'api-key') {
        throw new Error(`Codex provider ${options.provider.id} must use API-key authentication`);
    }
    if (options.model.engineId !== 'codex-cli' || options.model.providerId !== options.provider.id) {
        throw new Error(`model does not belong to Codex provider ${options.provider.id}`);
    }
    if (options.profile.providerId !== options.provider.id) {
        throw new Error(`profile provider does not match launch provider: ${options.profile.providerId}`);
    }
    if (options.profile.modelRecordId !== options.model.id) {
        throw new Error(`profile model does not match launch model: ${options.profile.modelRecordId}`);
    }
    if (options.profile.modelId !== options.model.modelId) {
        throw new Error(`profile model id does not match launch model: ${options.profile.modelId}`);
    }
    if (options.profile.reasoningEffort !== undefined
        && options.model.reasoningOptions.length > 0
        && !options.model.reasoningOptions.some(option => option.id === options.profile.reasoningEffort)) {
        throw new Error(`profile reasoning effort is not supported by launch model: ${options.profile.reasoningEffort}`);
    }
    const apiKey = options.apiKey.trim();
    if (apiKey.length === 0)
        throw new Error('Codex API key must not be empty');
    return apiKey;
}
async function cleanupFailedLaunch(runtime, runtimeRoot, preserveRuntimeRoot, original) {
    const errors = [asError(original)];
    if (runtime !== undefined) {
        try {
            await runtime.close();
        }
        catch (error) {
            errors.push(asError(error));
        }
    }
    if (!preserveRuntimeRoot) {
        try {
            await rm(runtimeRoot, { recursive: true, force: true });
        }
        catch (error) {
            errors.push(asError(error));
        }
    }
    if (errors.length === 1)
        throw original;
    throw new AggregateError(errors, 'Codex launch failed and cleanup also failed');
}
/**
 * Materializes one profile into an isolated CODEX_HOME and starts one Codex
 * app-server. The API key is passed through the child environment only; it is
 * never written to config.toml.
 */
export async function openCodexLaunch(options) {
    const apiKey = validateLaunchSelection(options);
    const runtimeRoot = options.runtimeRoot ?? await mkdtemp(join(tmpdir(), 'dsh-engine-suite-codex-'));
    const codexHome = join(runtimeRoot, 'codex-home');
    let runtime;
    try {
        await mkdir(codexHome, { recursive: true });
        const mcpEnvironment = await resolveCodexMcpEnvironment(options.mcpSet, memoizedCredentialResolver(options.credentialResolver ?? (() => undefined)));
        assertMcpEnvironmentDoesNotShadowLaunchEnvironment(mcpEnvironment, options.environment);
        const materialized = renderCodexConfig({
            providerName: options.provider.id,
            baseUri: options.provider.baseUri,
            model: options.model.modelId,
            apiKey,
            ...options.mcpSet === undefined ? {} : { mcpSet: options.mcpSet },
        });
        await writeFile(join(codexHome, 'config.toml'), materialized.configToml, { encoding: 'utf8', mode: 0o600 });
        const runtimeOptions = {
            cwd: options.cwd,
            ...options.executable === undefined ? {} : { executable: options.executable },
            ...options.args === undefined ? {} : { args: options.args },
            ...options.disposeGraceMs === undefined ? {} : { disposeGraceMs: options.disposeGraceMs },
            ...options.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: options.startupTimeoutMs },
            modelProvider: materialized.modelProvider,
            model: options.model.modelId,
            ...options.profile.reasoningEffort === undefined ? {} : { reasoningEffort: options.profile.reasoningEffort },
            ...options.baseInstructions === undefined ? {} : { baseInstructions: options.baseInstructions },
            ephemeral: options.ephemeral ?? false,
            ...options.permissionPreset === 'read-only' ? { approvalPolicy: 'on-request', sandbox: 'read-only' } : {},
            ...options.permissionPreset === 'workspace-write' ? { approvalPolicy: 'on-request', sandbox: 'workspace-write' } : {},
            ...options.permissionPreset === 'danger-full-access' ? { approvalPolicy: 'never', sandbox: 'danger-full-access' } : {},
            env: {
                ...options.environment ?? {},
                ...mcpEnvironment,
                ...materialized.environment,
                CODEX_HOME: codexHome,
            },
            redactions: [
                ...materialized.redactions,
                ...Object.values(mcpEnvironment),
                ...Object.values(options.environment ?? {}).filter(value => value.length > 0),
            ],
            ...options.serverRequestHandler === undefined ? {} : { serverRequestHandler: options.serverRequestHandler },
        };
        runtime = await CodexRuntime.open(runtimeOptions);
        if (options.resumeThreadId === undefined)
            await runtime.startThread();
        else
            await runtime.resumeThread(options.resumeThreadId);
        const roots = options.skillSet === undefined ? undefined : [...new Set(options.skillSet.additionalDirectories)];
        if (roots !== undefined) {
            await runtime.transport.request('skills/extraRoots/set', { extraRoots: roots });
        }
    }
    catch (error) {
        return cleanupFailedLaunch(runtime, runtimeRoot, options.preserveRuntimeRoot === true, error);
    }
    let closePromise;
    return {
        runtime,
        profile: options.profile,
        runtimeRoot,
        codexHome,
        close() {
            if (closePromise !== undefined)
                return closePromise;
            closePromise = (async () => {
                const errors = [];
                try {
                    await runtime?.close();
                }
                catch (error) {
                    errors.push(asError(error));
                }
                if (options.preserveRuntimeRoot !== true) {
                    try {
                        await rm(runtimeRoot, { recursive: true, force: true });
                    }
                    catch (error) {
                        errors.push(asError(error));
                    }
                }
                if (errors.length === 1)
                    throw errors[0];
                if (errors.length > 1)
                    throw new AggregateError(errors, 'Codex launch close failed');
            })();
            return closePromise;
        },
    };
}
//# sourceMappingURL=launch.js.map