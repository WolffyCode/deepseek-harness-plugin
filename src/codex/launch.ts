import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModelRecord } from '../model/types.js'
import type { EngineProvider } from '../provider/types.js'
import type { EngineProfileSnapshot } from '../profile/types.js'
import { CodexRuntime, type CodexRuntimeOptions } from './runtime.js'
import { renderCodexConfig } from './config.js'

export interface CodexLaunchOptions {
  readonly profile: EngineProfileSnapshot
  readonly provider: EngineProvider
  readonly model: ModelRecord
  readonly apiKey: string
  readonly cwd: string
  readonly executable?: string
  readonly args?: readonly string[]
  readonly disposeGraceMs?: number
  readonly baseInstructions?: string
  readonly ephemeral?: boolean
  readonly runtimeRoot?: string
}

export interface CodexLaunch {
  readonly runtime: CodexRuntime
  readonly profile: EngineProfileSnapshot
  readonly runtimeRoot: string
  readonly codexHome: string
  close(): Promise<void>
}

/**
 * Materializes one profile into an isolated CODEX_HOME and starts one Codex
 * app-server. The API key is passed through the child environment only; it is
 * never written to config.toml.
 */
export async function openCodexLaunch(options: CodexLaunchOptions): Promise<CodexLaunch> {
  if (options.profile.engineId !== 'codex-cli') throw new Error(`unsupported Codex profile engine: ${options.profile.engineId}`)
  if (options.provider.engineId !== 'codex-cli') throw new Error(`provider is not a Codex provider: ${options.provider.id}`)
  if (options.model.engineId !== 'codex-cli' || options.model.providerId !== options.provider.id) {
    throw new Error(`model does not belong to Codex provider ${options.provider.id}`)
  }
  if (options.profile.modelRecordId !== options.model.id) {
    throw new Error(`profile model does not match launch model: ${options.profile.modelRecordId}`)
  }
  if (options.profile.providerId !== options.provider.id) {
    throw new Error(`profile provider does not match launch provider: ${options.profile.providerId}`)
  }
  const apiKey = options.apiKey.trim()
  if (apiKey.length === 0) throw new Error('Codex API key must not be empty')
  const runtimeRoot = options.runtimeRoot ?? await mkdtemp(join(tmpdir(), 'dsh-engine-suite-codex-'))
  const codexHome = join(runtimeRoot, 'codex-home')
  await mkdir(codexHome, { recursive: true })
  const materialized = renderCodexConfig({
    providerName: options.provider.id,
    baseUri: options.provider.baseUri,
    model: options.model.modelId,
    apiKey,
  })
  await writeFile(join(codexHome, 'config.toml'), materialized.configToml, { encoding: 'utf8', mode: 0o600 })
  const runtimeOptions: CodexRuntimeOptions = {
    cwd: options.cwd,
    ...options.executable === undefined ? {} : { executable: options.executable },
    ...options.args === undefined ? {} : { args: options.args },
    ...options.disposeGraceMs === undefined ? {} : { disposeGraceMs: options.disposeGraceMs },
    modelProvider: materialized.modelProvider,
    model: options.model.modelId,
    ...options.profile.reasoningEffort === undefined ? {} : { reasoningEffort: options.profile.reasoningEffort },
    ...options.baseInstructions === undefined ? {} : { baseInstructions: options.baseInstructions },
    ephemeral: options.ephemeral ?? false,
    env: {
      CODEX_HOME: codexHome,
      ...materialized.environment,
    },
    redactions: [...materialized.redactions],
  }
  let runtime: CodexRuntime
  try {
    runtime = await CodexRuntime.open(runtimeOptions)
    await runtime.startThread()
  } catch (error: unknown) {
    await rm(runtimeRoot, { recursive: true, force: true })
    throw error
  }
  let closed = false
  return {
    runtime,
    profile: options.profile,
    runtimeRoot,
    codexHome,
    async close(): Promise<void> {
      if (closed) return
      closed = true
      await runtime.close()
      await rm(runtimeRoot, { recursive: true, force: true })
    },
  }
}
