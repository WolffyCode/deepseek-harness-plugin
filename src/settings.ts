import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { EngineSuiteRuntime } from './engine-suite.js'
import type {
  EngineHttpMcpServer,
  EngineMcpServer,
  EngineMcpSet,
  EngineMcpTransport,
  EngineSkillSet,
  EngineSseMcpServer,
  EngineStdioMcpServer,
} from './assets.js'

export const ENGINE_SUITE_SETTINGS_NAMESPACE = settingsNamespace('engine-suite')

export interface EngineSuiteProviderSettings {
  readonly id: string
  readonly engineId: string
  readonly name: string
  readonly baseUri: string
  readonly credentialRef: string
  readonly wireApi: 'responses' | 'anthropic'
  readonly authMode: 'api-key' | 'auth-token'
  readonly enabled: boolean
}

export interface EngineSuiteModelSettings {
  readonly id: string
  readonly engineId: string
  readonly providerId: string
  readonly modelId: string
  readonly displayName?: string
  readonly enabled: boolean
  readonly hidden: boolean
  readonly reasoningOptions: string[]
  readonly defaultReasoningEffort?: string
  readonly contextWindowTokens?: number
  readonly contextWindowSource: 'discovered' | 'manual' | 'unknown'
}

export type EngineSuiteSkillSetSettings = EngineSkillSet

/**
 * Raw settings input is intentionally transport-shaped rather than the
 * validated runtime union. The schema below is the single boundary that
 * rejects cross-transport fields before sync materializes EngineMcpServer.
 */
export interface EngineSuiteMcpServerSettings {
  readonly id: string
  readonly name: string
  readonly transport: EngineMcpTransport
  readonly command?: string
  readonly args?: string[]
  readonly environment?: Record<string, string>
  readonly url?: string
  readonly headers?: Record<string, string>
  readonly credentialRefs?: Record<string, string>
}

export interface EngineSuiteMcpSetSettings {
  readonly id: string
  readonly servers: EngineSuiteMcpServerSettings[]
}

type SettingsRecord = Readonly<Record<string, unknown>>

/** Optional fields resolve to an absent value instead of an empty default. */
function absentWhenMissing<S, T>(schema: z<S, T>): z<S | undefined, T | undefined> {
  return z.union([schema, z.const(undefined)]).default(undefined)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${label} must not be empty`)
  return normalized
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((item, index) => requiredString(item, `${label}[${index}]`))
}

function optionalStringRecord(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key.length === 0) throw new Error(`${label} contains an empty key`)
    if (typeof item !== 'string') throw new Error(`${label}.${key} must be a string`)
    result[key] = item
  }
  return result
}

function assertAllowedKeys(
  value: object,
  allowedKeys: readonly string[],
  optionalKeys: readonly string[],
  transport: string,
): void {
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${transport} MCP server must not declare ${key}`)
  }
  for (const key of optionalKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && Reflect.get(value, key) === undefined) {
      throw new Error(`${transport} MCP server must not declare ${key} as undefined`)
    }
  }
}

const mcpServerIdSchema = z.string().min(1).required()
const mcpServerNameSchema = z.string().min(1).required()
const mcpCredentialRefsSchema = absentWhenMissing(z.dict(z.string().min(1).required()))

const stdioMcpServerInputSchema = z.object({
  id: mcpServerIdSchema,
  name: mcpServerNameSchema,
  transport: z.const('stdio').required(),
  command: z.string().min(1).required(),
  args: absentWhenMissing(z.array(z.string().min(1).required())),
  environment: absentWhenMissing(z.dict(z.string())),
  credentialRefs: mcpCredentialRefsSchema,
})

const httpMcpServerInputSchema = z.object({
  id: mcpServerIdSchema,
  name: mcpServerNameSchema,
  transport: z.const('http').required(),
  url: z.string().min(1).required(),
  headers: absentWhenMissing(z.dict(z.string())),
  credentialRefs: mcpCredentialRefsSchema,
})

const sseMcpServerInputSchema = z.object({
  id: mcpServerIdSchema,
  name: mcpServerNameSchema,
  transport: z.const('sse').required(),
  url: z.string().min(1).required(),
  headers: absentWhenMissing(z.dict(z.string())),
  credentialRefs: mcpCredentialRefsSchema,
})

function normalizeStdioMcpServer(value: SettingsRecord): EngineStdioMcpServer {
  assertAllowedKeys(
    value,
    ['id', 'name', 'transport', 'command', 'args', 'environment', 'credentialRefs'],
    ['args', 'environment', 'credentialRefs'],
    'stdio',
  )
  const args = optionalStringArray(value['args'], 'MCP args')
  const environment = optionalStringRecord(value['environment'], 'MCP environment')
  const credentialRefs = optionalStringRecord(value['credentialRefs'], 'MCP credentialRefs')
  return {
    id: requiredString(value['id'], 'MCP server id'),
    name: requiredString(value['name'], 'MCP server name'),
    transport: 'stdio',
    command: requiredString(value['command'], 'MCP command'),
    ...(args === undefined ? {} : { args }),
    ...(environment === undefined ? {} : { environment }),
    ...(credentialRefs === undefined ? {} : { credentialRefs }),
  }
}

function normalizeHttpMcpServer(value: SettingsRecord): EngineHttpMcpServer {
  assertAllowedKeys(
    value,
    ['id', 'name', 'transport', 'url', 'headers', 'credentialRefs'],
    ['headers', 'credentialRefs'],
    'http',
  )
  const headers = optionalStringRecord(value['headers'], 'MCP headers')
  const credentialRefs = optionalStringRecord(value['credentialRefs'], 'MCP credentialRefs')
  return {
    id: requiredString(value['id'], 'MCP server id'),
    name: requiredString(value['name'], 'MCP server name'),
    transport: 'http',
    url: requiredString(value['url'], 'MCP URL'),
    ...(headers === undefined ? {} : { headers }),
    ...(credentialRefs === undefined ? {} : { credentialRefs }),
  }
}

function normalizeSseMcpServer(value: SettingsRecord): EngineSseMcpServer {
  assertAllowedKeys(
    value,
    ['id', 'name', 'transport', 'url', 'headers', 'credentialRefs'],
    ['headers', 'credentialRefs'],
    'sse',
  )
  const headers = optionalStringRecord(value['headers'], 'MCP headers')
  const credentialRefs = optionalStringRecord(value['credentialRefs'], 'MCP credentialRefs')
  return {
    id: requiredString(value['id'], 'MCP server id'),
    name: requiredString(value['name'], 'MCP server name'),
    transport: 'sse',
    url: requiredString(value['url'], 'MCP URL'),
    ...(headers === undefined ? {} : { headers }),
    ...(credentialRefs === undefined ? {} : { credentialRefs }),
  }
}

const stdioMcpServerSchema = z.transform(stdioMcpServerInputSchema, normalizeStdioMcpServer)
const httpMcpServerSchema = z.transform(httpMcpServerInputSchema, normalizeHttpMcpServer)
const sseMcpServerSchema = z.transform(sseMcpServerInputSchema, normalizeSseMcpServer)
const mcpServerSchema = z.union([stdioMcpServerSchema, httpMcpServerSchema, sseMcpServerSchema])

function assertActiveModelPolicy(model: Pick<EngineSuiteModelSettings, 'engineId' | 'modelId' | 'displayName'>): void {
  const modelText = `${model.modelId} ${model.displayName ?? ''}`.toLocaleLowerCase()
  if (model.engineId === 'claude-cli' && !modelText.includes('glm')) {
    throw new Error(`Claude CLI settings only permit GLM models: ${model.modelId}`)
  }
  if (modelText.includes('opus')) throw new Error(`Claude Opus models are not supported by active settings: ${model.modelId}`)
  if (model.engineId !== 'claude-cli' && model.engineId !== 'codex-cli') {
    throw new Error(`unsupported active engine model: ${model.engineId}`)
  }
}

export interface EngineSuiteProfileSettings {
  readonly id: string
  readonly name?: string
  readonly engineId: string
  readonly providerId: string
  readonly modelRecordId: string
  readonly reasoningEffort?: string
  readonly skillSetRef?: string
  readonly mcpSetRef?: string
  readonly allowedChildProfiles: string[]
  readonly maxChildDepth: number
  readonly maxConcurrentChildren: number
  readonly enabled: boolean
}

export interface EngineSuiteSettings {
  readonly providers: EngineSuiteProviderSettings[]
  readonly models: EngineSuiteModelSettings[]
  readonly profiles?: EngineSuiteProfileSettings[]
  readonly skillSets?: EngineSuiteSkillSetSettings[]
  readonly mcpSets?: EngineSuiteMcpSetSettings[]
}

export const EngineSuiteSettingsSchema: z<EngineSuiteSettings> = z.object({
  skillSets: z.array(z.object({
    id: z.string().min(1),
    pluginDirs: z.array(z.string()).default([]),
    additionalDirectories: z.array(z.string()).default([]),
  })).default([]),
  mcpSets: z.array(z.object({
    id: z.string().min(1),
    servers: z.array(mcpServerSchema).default([]),
  })).default([]),
  providers: z.array(z.object({
    id: z.string().min(1),
    engineId: z.string().min(1),
    name: z.string().min(1),
    baseUri: z.string().min(1),
    credentialRef: z.string().min(1),
    wireApi: z.union([z.const('responses'), z.const('anthropic')]).default('responses'),
    authMode: z.union([z.const('api-key'), z.const('auth-token')]).default('api-key'),
    enabled: z.boolean().default(true),
  })).default([]),
  profiles: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    engineId: z.string().min(1),
    providerId: z.string().min(1),
    modelRecordId: z.string().min(1),
    reasoningEffort: z.string(),
    skillSetRef: z.string(),
    mcpSetRef: z.string(),
    allowedChildProfiles: z.array(z.string().min(1)).default([]),
    maxChildDepth: z.number().step(1).min(0).default(1),
    maxConcurrentChildren: z.number().step(1).min(1).default(1),
    enabled: z.boolean().default(true),
  })).default([]),
  models: z.array(z.object({
    id: z.string().min(1),
    engineId: z.string().min(1),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    displayName: z.string(),
    enabled: z.boolean().default(true),
    hidden: z.boolean().default(false),
    reasoningOptions: z.array(z.string()).default([]),
    defaultReasoningEffort: z.string(),
    contextWindowTokens: z.number().step(1).min(1),
    contextWindowSource: z.union([
      z.const('discovered'),
      z.const('manual'),
      z.const('unknown'),
    ]).default('unknown'),
  })).default([]),
})


/**
 * Replace the process-local runtime catalog from the persisted settings view.
 * Credentials remain references; this function never reads or stores a secret.
 */
export function syncEngineSuiteSettings(
  suite: EngineSuiteRuntime,
  value: EngineSuiteSettings,
): void {
  const providers = value.providers.map(provider => ({
    id: provider.id,
    engineId: provider.engineId,
    name: provider.name,
    baseUri: provider.baseUri,
    credentialRef: provider.credentialRef,
    enabled: provider.enabled,
    wireApi: provider.wireApi,
    authMode: provider.authMode,
  }))
  for (const model of value.models) assertActiveModelPolicy(model)
  const models = value.models.map(model => ({
    id: model.id,
    engineId: model.engineId,
    providerId: model.providerId,
    modelId: model.modelId,
    ...model.displayName === undefined ? {} : { displayName: model.displayName },
    enabled: model.enabled,
    hidden: model.hidden,
    reasoningOptions: model.reasoningOptions.map(id => ({ id })),
    ...model.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
    ...model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens },
    contextWindowSource: model.contextWindowSource,
    source: model.contextWindowSource === 'discovered' ? 'discovered' as const : 'manual' as const,
  }))
  suite.providers.replaceAll(providers)
  suite.models.replaceAll(models)
  suite.assets.replaceSkillSets((value.skillSets ?? []).map(set => ({
    id: set.id,
    pluginDirs: [...set.pluginDirs],
    additionalDirectories: [...set.additionalDirectories],
  })))
  suite.assets.replaceMcpSets((value.mcpSets ?? []).map(set => ({
    id: set.id,
    servers: set.servers.map(server => {
      switch (server.transport) {
        case 'stdio': {
          assertAllowedKeys(
            server,
            ['id', 'name', 'transport', 'command', 'args', 'environment', 'credentialRefs'],
            ['args', 'environment', 'credentialRefs'],
            'stdio',
          )
          const args = optionalStringArray(server.args, 'MCP args')
          const environment = optionalStringRecord(server.environment, 'MCP environment')
          const credentialRefs = optionalStringRecord(server.credentialRefs, 'MCP credentialRefs')
          return {
            id: requiredString(server.id, 'MCP server id'),
            name: requiredString(server.name, 'MCP server name'),
            transport: 'stdio' as const,
            command: requiredString(server.command, 'MCP command'),
            ...(args === undefined ? {} : { args }),
            ...(environment === undefined ? {} : { environment }),
            ...(credentialRefs === undefined ? {} : { credentialRefs }),
          }
        }
        case 'http': {
          assertAllowedKeys(
            server,
            ['id', 'name', 'transport', 'url', 'headers', 'credentialRefs'],
            ['headers', 'credentialRefs'],
            'http',
          )
          const headers = optionalStringRecord(server.headers, 'MCP headers')
          const credentialRefs = optionalStringRecord(server.credentialRefs, 'MCP credentialRefs')
          return {
            id: requiredString(server.id, 'MCP server id'),
            name: requiredString(server.name, 'MCP server name'),
            transport: 'http' as const,
            url: requiredString(server.url, 'MCP URL'),
            ...(headers === undefined ? {} : { headers }),
            ...(credentialRefs === undefined ? {} : { credentialRefs }),
          }
        }
        case 'sse': {
          assertAllowedKeys(
            server,
            ['id', 'name', 'transport', 'url', 'headers', 'credentialRefs'],
            ['headers', 'credentialRefs'],
            'sse',
          )
          const headers = optionalStringRecord(server.headers, 'MCP headers')
          const credentialRefs = optionalStringRecord(server.credentialRefs, 'MCP credentialRefs')
          return {
            id: requiredString(server.id, 'MCP server id'),
            name: requiredString(server.name, 'MCP server name'),
            transport: 'sse' as const,
            url: requiredString(server.url, 'MCP URL'),
            ...(headers === undefined ? {} : { headers }),
            ...(credentialRefs === undefined ? {} : { credentialRefs }),
          }
        }
      }
    }),
  })))
  suite.profiles.replaceAll((value.profiles ?? []).map(profile => ({
    id: profile.id,
    ...profile.name === undefined ? {} : { name: profile.name },
    selection: {
      engineId: profile.engineId,
      providerId: profile.providerId,
      modelRecordId: profile.modelRecordId,
      ...profile.reasoningEffort === undefined ? {} : { reasoningEffort: profile.reasoningEffort },
    },
    ...profile.skillSetRef === undefined ? {} : { skillSetRef: profile.skillSetRef },
    ...profile.mcpSetRef === undefined ? {} : { mcpSetRef: profile.mcpSetRef },
    allowedChildProfiles: profile.allowedChildProfiles,
    maxChildDepth: profile.maxChildDepth,
    maxConcurrentChildren: profile.maxConcurrentChildren,
    enabled: profile.enabled,
  })))
}

/** Register and live-sync the persisted catalog namespace when settings is present. */
export function registerEngineSuiteSettings(
  ctx: Context,
  onChange?: (value: EngineSuiteSettings) => void,
  afterReady?: () => void,
  base?: Partial<EngineSuiteSettings>,
): void {
  ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(ENGINE_SUITE_SETTINGS_NAMESPACE, EngineSuiteSettingsSchema, {
      applies: 'live',
      validate: value => {
        for (const model of value.models) assertActiveModelPolicy(model)
      },
      ...base === undefined ? {} : { base },
    })
    onChange?.(scope.get())
    if (onChange !== undefined) scope.watch(onChange)
    afterReady?.()
  })
}
