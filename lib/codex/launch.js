import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexRuntime } from './runtime.js';
import { renderCodexConfig } from './config.js';
/**
 * Materializes one profile into an isolated CODEX_HOME and starts one Codex
 * app-server. The API key is passed through the child environment only; it is
 * never written to config.toml.
 */
export async function openCodexLaunch(options) {
    if (options.profile.engineId !== 'codex-cli')
        throw new Error(`unsupported Codex profile engine: ${options.profile.engineId}`);
    if (options.provider.engineId !== 'codex-cli')
        throw new Error(`provider is not a Codex provider: ${options.provider.id}`);
    if (options.model.engineId !== 'codex-cli' || options.model.providerId !== options.provider.id) {
        throw new Error(`model does not belong to Codex provider ${options.provider.id}`);
    }
    if (options.profile.modelRecordId !== options.model.id) {
        throw new Error(`profile model does not match launch model: ${options.profile.modelRecordId}`);
    }
    if (options.profile.providerId !== options.provider.id) {
        throw new Error(`profile provider does not match launch provider: ${options.profile.providerId}`);
    }
    const apiKey = options.apiKey.trim();
    if (apiKey.length === 0)
        throw new Error('Codex API key must not be empty');
    const runtimeRoot = options.runtimeRoot ?? await mkdtemp(join(tmpdir(), 'dsh-engine-suite-codex-'));
    const codexHome = join(runtimeRoot, 'codex-home');
    await mkdir(codexHome, { recursive: true });
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
        modelProvider: materialized.modelProvider,
        model: options.model.modelId,
        ...options.profile.reasoningEffort === undefined ? {} : { reasoningEffort: options.profile.reasoningEffort },
        ...options.baseInstructions === undefined ? {} : { baseInstructions: options.baseInstructions },
        ephemeral: options.ephemeral ?? false,
        ...options.permissionPreset === 'read-only' ? { approvalPolicy: 'on-request', sandbox: 'read-only' } : {},
        ...options.permissionPreset === 'workspace-write' ? { approvalPolicy: 'on-request', sandbox: 'workspace-write' } : {},
        ...options.permissionPreset === 'danger-full-access' ? { approvalPolicy: 'never', sandbox: 'danger-full-access' } : {},
        env: {
            CODEX_HOME: codexHome,
            ...materialized.environment,
            ...options.environment ?? {},
        },
        redactions: [...materialized.redactions, ...Object.values(options.environment ?? {})],
        ...options.serverRequestHandler === undefined ? {} : { serverRequestHandler: options.serverRequestHandler },
    };
    let runtime;
    try {
        runtime = await CodexRuntime.open(runtimeOptions);
        if (options.resumeThreadId === undefined)
            await runtime.startThread();
        else
            await runtime.resumeThread(options.resumeThreadId);
    }
    catch (error) {
        await rm(runtimeRoot, { recursive: true, force: true });
        throw error;
    }
    let closed = false;
    return {
        runtime,
        profile: options.profile,
        runtimeRoot,
        codexHome,
        async close() {
            if (closed)
                return;
            closed = true;
            await runtime.close();
            if (options.preserveRuntimeRoot !== true)
                await rm(runtimeRoot, { recursive: true, force: true });
        },
    };
}
//# sourceMappingURL=launch.js.map