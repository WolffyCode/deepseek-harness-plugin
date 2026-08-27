import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineProvider } from '../provider/types.js'
import { createModel, type ModelRecord } from '../model/types.js'
import { CodexRuntime, type CodexRuntimeOptions } from './runtime.js'
import { renderCodexProviderConfig } from './config.js'

export interface CodexModelDiscoveryOptions {
  readonly provider: EngineProvider
  readonly apiKey: string
  readonly cwd: string
  readonly executable?: string
  readonly args?: readonly string[]
  readonly disposeGraceMs?: number
  readonly startupTimeoutMs?: number
}

function stringField(value: unknown, name: string): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function reasoningOptions(value: unknown): { id: string; description?: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []
    const effort = stringField((entry as Record<string, unknown>)['reasoningEffort'], 'reasoningEffort')
    if (effort === undefined) return []
    const description = stringField((entry as Record<string, unknown>)['description'], 'description')
    return [{ id: effort, ...description === undefined ? {} : { description } }]
  })
}

export async function discoverCodexModels(options: CodexModelDiscoveryOptions): Promise<readonly ModelRecord[]> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-suite-discovery-'))
  const codexHome = join(root, 'codex-home')
  await mkdir(codexHome, { recursive: true })
  const materialized = renderCodexProviderConfig({
    providerName: options.provider.id,
    baseUri: options.provider.baseUri,
    apiKey: options.apiKey,
  })
  await writeFile(join(codexHome, 'config.toml'), materialized.configToml, { encoding: 'utf8', mode: 0o600 })
  const runtimeOptions: CodexRuntimeOptions = {
    cwd: options.cwd,
    ...options.executable === undefined ? {} : { executable: options.executable },
    ...options.args === undefined ? {} : { args: options.args },
    ...options.disposeGraceMs === undefined ? {} : { disposeGraceMs: options.disposeGraceMs },
    ...options.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: options.startupTimeoutMs },
    modelProvider: materialized.modelProvider,
    env: { CODEX_HOME: codexHome, ...materialized.environment },
    redactions: [...materialized.redactions],
  }
  let runtime: CodexRuntime | undefined
  try {
    runtime = await CodexRuntime.open(runtimeOptions)
    const models = await runtime.listModels({ includeHidden: true })
    return models.flatMap((entry, index) => {
      const modelId = stringField(entry['model'], 'model') ?? stringField(entry['id'], 'id')
      if (modelId === undefined) return []
      const displayName = stringField(entry['displayName'], 'displayName')
      const description = stringField(entry['description'], 'description')
      const efforts = reasoningOptions(entry['supportedReasoningEfforts'])
      const defaultReasoning = stringField(entry['defaultReasoningEffort'], 'defaultReasoningEffort')
      const hidden = entry['hidden'] === true
      return [createModel({
        id: `${options.provider.id}/${modelId}/${index}`,
        engineId: options.provider.engineId,
        providerId: options.provider.id,
        modelId,
        ...displayName === undefined ? {} : { displayName },
        ...description === undefined ? {} : { description },
        reasoningOptions: efforts,
        ...defaultReasoning === undefined ? {} : { defaultReasoningEffort: defaultReasoning },
        enabled: entry['enabled'] !== false,
        hidden,
        contextWindowSource: 'unknown',
        source: 'discovered',
      })]
    })
  } finally {
    await runtime?.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
}
