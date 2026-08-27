import type { EngineDefinition } from './engine/types.js'
import type { SessionStore, SessionStoreFlush } from '@anthropic-ai/claude-agent-sdk'
import { EngineAssetRegistry, type EngineMcpSet, type EngineMcpServer, type EngineSkillSet } from './assets.js'
import type { CreateModelInput, ModelRecord } from './model/types.js'
import { discoverCodexModels, type CodexModelDiscoveryOptions } from './codex/discovery.js'
import { openCodexLaunch, type CodexLaunch, type CodexLaunchOptions } from './codex/launch.js'
import { createClaudeProviderSession, type ClaudeAgentSession, type ClaudeAdapterOptions } from './claude/adapter.js'
import {
  ClaudeAssetMaterializationError,
  materializeClaudeMcpOptions,
  type CanonicalMcpSet,
  type ClaudeMcpMaterializeOptions,
  type ClaudeSdkMcpServerConfig,
} from './claude/mcp.js'
import { materializeClaudeSkills, type CanonicalSkillAssets } from './claude/skills.js'
import { assertClaudeModelAllowed, isOpusModel } from './claude/session.js'
import {
  createClaudeArchiveStore,
  getClaudeSessionHistory,
  importClaudeSessionToStore,
  listClaudeSessionDescriptors,
  normalizeClaudePersistenceHandle,
  realClaudeSdkGateway,
  type ClaudeArchiveState,
  type ClaudeArchiveStore,
  type ClaudeImportedSession,
  type ClaudeSdkGateway,
  type ClaudeSessionDescriptor,
  type ClaudeSessionHistoryOptions,
  type ListClaudeSessionsInput,
} from './claude/persistence.js'
import type { ClaudeCatalogModel, ClaudePersistenceHandle } from './claude/types.js'
import { ClaudeSessionRuntimeBridge } from './agent/runtime.js'
import { EngineRegistry, ModelCatalog, ProviderRegistry } from './registry.js'
import { resolveEngineProfile } from './profile/resolver.js'
import type { EngineProfileSnapshot, EngineSelection } from './profile/types.js'
import { EngineProfileCatalog, type EngineProfileDefinition } from './profile/catalog.js'
import type { JsonRpcRequestHandler } from './codex/json-rpc.js'

export interface ExternalEngineLaunch {
  readonly runtime: import('./agent/runtime.js').ExternalEngineRuntime
  readonly profile: EngineProfileSnapshot
  readonly runtimeRoot: string
  readonly nativeSessionId: string
  close(): Promise<void>
}

export interface OpenEngineOptions {
  readonly apiKey: string
  readonly cwd: string
  readonly executable?: string
  readonly args?: readonly string[]
  readonly disposeGraceMs?: number
  readonly startupTimeoutMs?: number
  readonly runtimeRoot?: string
  readonly preserveRuntimeRoot?: boolean
  readonly resumeThreadId?: string
  readonly permissionPreset?: string
  readonly serverRequestHandler?: JsonRpcRequestHandler
  /** Optional runtime asset overrides; profile references are used by default. */
  readonly mcpSet?: EngineMcpSet
  readonly skillSet?: EngineSkillSet
  /** Harness-owned MCP is injected separately and never enters the user materializer. */
  readonly internalMcpSet?: EngineMcpSet
  /** Runtime resolver for profile MCP credential references. */
  readonly credentialResolver?: EngineSuiteCredentialResolver
  readonly environment?: Readonly<Record<string, string>>
  /** SDK SessionStore used for Claude transcript mirroring. */
  readonly sessionStore?: SessionStore
  readonly sessionStoreFlush?: SessionStoreFlush
}

export interface OpenCodexOptions extends OpenEngineOptions {}

export interface DiscoverCodexModelsOptions {
  readonly apiKey: string
  readonly cwd: string
  readonly executable?: string
  readonly args?: readonly string[]
  readonly disposeGraceMs?: number
  readonly startupTimeoutMs?: number
  readonly runtimeRoot?: string
  readonly preserveRuntimeRoot?: boolean
  readonly resumeThreadId?: string
}

export interface DiscoverClaudeModelsOptions {
  readonly apiKey: string
  readonly cwd: string
  readonly executable?: string
  readonly args?: readonly string[]
  readonly catalogTtlMs?: number
}

export interface EngineSuite {
  readonly engines: EngineRegistry
  readonly providers: ProviderRegistry
  readonly models: ModelCatalog
  readonly profiles: EngineProfileCatalog
  readonly assets: EngineAssetRegistry
  resolveProfile(selection: EngineSelection): EngineProfileSnapshot
  discoverCodexModels(providerId: string, options: DiscoverCodexModelsOptions): Promise<readonly ModelRecord[]>
  discoverClaudeModels(providerId: string, options: DiscoverClaudeModelsOptions): Promise<readonly ModelRecord[]>
}

/** Internal runtime face. It is intentionally not re-exported from the package root. */
export interface ClaudeSessionConnectionOptions extends Omit<OpenEngineOptions, 'cwd' | 'resumeThreadId'> {
  readonly handle: ClaudePersistenceHandle
  readonly cwd?: string
}

export interface EngineSuiteRuntime extends EngineSuite {
  readonly claudeArchiveStore: ClaudeArchiveStore
  openCodex(selection: EngineSelection, options: OpenCodexOptions): Promise<CodexLaunch>
  openEngine(selection: EngineSelection, options: OpenEngineOptions): Promise<ExternalEngineLaunch>
  listClaudeSessions(input?: ListClaudeSessionsInput): Promise<ClaudeSessionDescriptor[]>
  getClaudeSessionHistory(handle: ClaudePersistenceHandle, input?: ClaudeSessionHistoryOptions): Promise<import('@anthropic-ai/claude-agent-sdk').SessionMessage[]>
  importClaudeSession(input: import('./claude/persistence.js').ClaudeImportSessionInput): Promise<ClaudeImportedSession>
  archiveClaudeSession(handle: ClaudePersistenceHandle, archivedAt?: string): ClaudeArchiveState
  unarchiveClaudeSession(handle: ClaudePersistenceHandle): boolean
  resumeClaudeSession(selection: EngineSelection, options: ClaudeSessionConnectionOptions): Promise<ExternalEngineLaunch>
  reconnectClaudeSession(selection: EngineSelection, options: ClaudeSessionConnectionOptions): Promise<ExternalEngineLaunch>
}

export const CODEX_ENGINE: EngineDefinition = {
  id: 'codex-cli',
  type: 'codex-cli',
  displayName: 'Codex CLI',
  capabilities: {
    streaming: true,
    sessionResume: true,
    modelDiscovery: true,
    reasoningDiscovery: true,
    approvals: true,
    mcp: true,
    skills: true,
    backgroundAgent: false,
    steer: true,
    fork: false,
  },
}

export const CLAUDE_ENGINE: EngineDefinition = {
  id: 'claude-cli',
  type: 'claude-cli',
  displayName: 'Claude CLI',
  capabilities: {
    streaming: true,
    sessionResume: true,
    modelDiscovery: true,
    reasoningDiscovery: true,
    approvals: true,
    mcp: true,
    skills: true,
    backgroundAgent: false,
    steer: false,
    fork: false,
  },
}

type ProfileResolverOptions = Parameters<typeof resolveEngineProfile>[2]

export type EngineSuiteCredentialResolver = (credentialRef: string) => string | undefined | Promise<string | undefined>

export type ClaudeMcpMaterializer = (
  input: CanonicalMcpSet,
  options: ClaudeMcpMaterializeOptions,
) => ReturnType<typeof materializeClaudeMcpOptions>

export type ClaudeSkillMaterializer = (
  input: CanonicalSkillAssets,
) => ReturnType<typeof materializeClaudeSkills>

export interface CreateEngineSuiteRuntimeOptions {
  readonly claudeSessionFactory?: (options: ClaudeAdapterOptions) => ClaudeAgentSession
  readonly credentialResolver?: EngineSuiteCredentialResolver
  readonly claudeMcpMaterializer?: ClaudeMcpMaterializer
  readonly claudeSkillMaterializer?: ClaudeSkillMaterializer
  readonly claudeSdkGateway?: ClaudeSdkGateway
  readonly claudeArchiveStore?: ClaudeArchiveStore
}

function claudeModelDescriptor(model: Pick<CreateModelInput, 'id' | 'modelId' | 'displayName'>): Record<string, unknown> {
  return {
    value: model.modelId,
    displayName: model.displayName,
    resolvedModel: model.id,
  }
}

function isClaudeOpusModel(model: Pick<CreateModelInput, 'engineId' | 'id' | 'modelId' | 'displayName'>): boolean {
  return model.engineId === 'claude-cli' && isOpusModel(claudeModelDescriptor(model))
}

function isClaudeGlmModel(model: ClaudeCatalogModel): boolean {
  const text = [model.id, model.value, model.resolvedModel, model.label, model.description]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .toLocaleLowerCase()
  return text.includes('glm')
}

function toClaudeModelRecord(providerId: string, model: ClaudeCatalogModel): CreateModelInput | undefined {
  const modelId = model.value ?? model.resolvedModel ?? model.id
  if (!isClaudeGlmModel(model) || modelId.trim().length === 0) return undefined
  const reasoningOptions = model.supportedEffortLevels?.map(id => ({ id }))
  return {
    id: `${providerId}/${modelId}`,
    engineId: 'claude-cli',
    providerId,
    modelId,
    ...(model.label === undefined ? {} : { displayName: model.label }),
    ...(model.description === undefined ? {} : { description: model.description }),
    ...(reasoningOptions === undefined ? {} : { reasoningOptions }),
    ...(model.contextWindow === undefined ? {} : { contextWindowTokens: model.contextWindow }),
    contextWindowSource: model.contextWindow === undefined ? 'unknown' : 'discovered',
    source: 'discovered',
  }
}

class ClaudePolicyModelCatalog extends ModelCatalog {
  private blockedModelRecordIds = new Set<string>()

  override register(input: CreateModelInput): ModelRecord {
    if (isClaudeOpusModel(input)) assertClaudeModelAllowed(claudeModelDescriptor(input))
    this.blockedModelRecordIds.delete(input.id)
    return super.register(input)
  }

  override replaceAll(inputs: readonly CreateModelInput[]): void {
    this.blockedModelRecordIds = new Set(inputs.filter(isClaudeOpusModel).map(model => model.id))
    super.replaceAll(inputs.filter(model => !isClaudeOpusModel(model)))
  }

  override replaceProvider(providerId: string, models: readonly ModelRecord[]): void {
    for (const model of models) this.blockedModelRecordIds.delete(model.id)
    const allowed = models.filter(model => {
      if (!isClaudeOpusModel(model)) return true
      this.blockedModelRecordIds.add(model.id)
      return false
    })
    super.replaceProvider(providerId, allowed)
  }

  assertSelectionAllowed(selection: EngineSelection): void {
    if (selection.engineId !== 'claude-cli') return
    if (this.blockedModelRecordIds.has(selection.modelRecordId) || isOpusModel(selection.modelRecordId)) {
      assertClaudeModelAllowed(selection.modelRecordId)
    }
  }
}

function profileResolverOptions(definition: EngineProfileDefinition | undefined): ProfileResolverOptions {
  if (definition === undefined) return {}
  return {
    id: definition.id,
    ...definition.name === undefined ? {} : { name: definition.name },
    ...definition.revision === undefined ? {} : { revision: definition.revision },
    ...definition.allowedChildProfiles === undefined ? {} : { allowedChildProfiles: definition.allowedChildProfiles },
    ...definition.maxChildDepth === undefined ? {} : { maxChildDepth: definition.maxChildDepth },
    ...definition.maxConcurrentChildren === undefined ? {} : { maxConcurrentChildren: definition.maxConcurrentChildren },
    ...definition.skillSetRef === undefined ? {} : { skillSetRef: definition.skillSetRef },
    ...definition.mcpSetRef === undefined ? {} : { mcpSetRef: definition.mcpSetRef },
  }
}

function canonicalMcpSet(input: EngineMcpSet): CanonicalMcpSet {
  return {
    scope: 'user',
    servers: input.servers.map(server => {
      if (server.transport === 'stdio') {
        if (server.command === undefined) throw new Error(`stdio MCP server ${server.id} requires a command`)
        return {
          name: server.name,
          transport: 'stdio' as const,
          command: server.command,
          ...(server.args === undefined ? {} : { args: [...server.args] }),
          ...(server.environment === undefined ? {} : { env: { ...server.environment } }),
          ...(server.credentialRefs === undefined ? {} : { credentialRefs: { ...server.credentialRefs } }),
        }
      }
      if (server.url === undefined) throw new Error(`${server.transport.toUpperCase()} MCP server ${server.id} requires a URL`)
      return {
        name: server.name,
        transport: server.transport,
        url: server.url,
        ...(server.headers === undefined ? {} : { headers: { ...server.headers } }),
        ...(server.credentialRefs === undefined ? {} : { credentialRefs: { ...server.credentialRefs } }),
      }
    }),
  }
}

function mergeMcpSets(userSet: EngineMcpSet | undefined, internalSet: EngineMcpSet | undefined): EngineMcpSet | undefined {
  if (userSet === undefined && internalSet === undefined) return undefined
  const servers = [...userSet?.servers ?? [], ...internalSet?.servers ?? []]
  const ids = new Set<string>()
  for (const server of servers) {
    if (ids.has(server.id)) throw new Error(`MCP server id is duplicated across user and internal assets: ${server.id}`)
    ids.add(server.id)
  }
  return { id: userSet?.id ?? internalSet?.id ?? 'engine-suite-runtime', servers }
}

function codexMcpSet(userSet: EngineMcpSet | undefined, internalSet: EngineMcpSet | undefined): EngineMcpSet | undefined {
  if (internalSet !== undefined) materializeInternalMcpServers(internalSet)
  return mergeMcpSets(userSet, internalSet)
}

function materializeInternalMcpServers(input: EngineMcpSet | undefined): Readonly<Record<string, ClaudeSdkMcpServerConfig>> {
  if (input === undefined) return {}
  const result: Record<string, ClaudeSdkMcpServerConfig> = {}
  for (const server of input.servers) {
    if (server.credentialRefs !== undefined && Object.keys(server.credentialRefs).length > 0) {
      throw new Error(`internal MCP server ${server.id} cannot carry credential references`)
    }
    if (result[server.name] !== undefined) throw new Error(`internal MCP server name is duplicated: ${server.name}`)
    if (server.transport === 'stdio') {
      if (server.command === undefined) throw new Error(`stdio MCP server ${server.id} requires a command`)
      result[server.name] = {
        type: 'stdio',
        command: server.command,
        ...(server.args === undefined ? {} : { args: [...server.args] }),
        ...(server.environment === undefined ? {} : { env: { ...server.environment } }),
      }
    } else {
      if (server.url === undefined) throw new Error(`${server.transport.toUpperCase()} MCP server ${server.id} requires a URL`)
      result[server.name] = {
        type: server.transport,
        url: server.url,
        ...(server.headers === undefined ? {} : { headers: { ...server.headers } }),
      }
    }
  }
  return result
}

function mergeClaudeMcpServers(
  userServers: Readonly<Record<string, ClaudeSdkMcpServerConfig>> | undefined,
  internalServers: Readonly<Record<string, ClaudeSdkMcpServerConfig>>,
): Readonly<Record<string, ClaudeSdkMcpServerConfig>> | undefined {
  if (userServers === undefined && Object.keys(internalServers).length === 0) return undefined
  const result: Record<string, ClaudeSdkMcpServerConfig> = { ...userServers }
  for (const [name, server] of Object.entries(internalServers)) {
    if (result[name] !== undefined) throw new Error(`internal MCP server conflicts with user MCP server: ${name}`)
    result[name] = server
  }
  return result
}

function credentialReferencePaths(input: CanonicalMcpSet): ReadonlyMap<string, string> {
  const paths = new Map<string, string>()
  input.servers.forEach((server, index) => {
    for (const [target, reference] of Object.entries(server.credentialRefs ?? {})) {
      if (!paths.has(reference)) paths.set(reference, `mcpServers[${index}].credentialRefs.${target}`)
    }
  })
  return paths
}

async function materializerCredentialResolver(
  input: CanonicalMcpSet,
  resolver: EngineSuiteCredentialResolver | undefined,
): Promise<ClaudeMcpMaterializeOptions['credentialResolver']> {
  const paths = credentialReferencePaths(input)
  if (paths.size === 0 || resolver === undefined) return undefined
  const resolved = new Map<string, string | undefined>()
  await Promise.all([...paths.entries()].map(async ([reference, path]) => {
    let value: string | undefined
    try {
      value = await resolver(reference)
    } catch {
      throw new ClaudeAssetMaterializationError('MCP_CREDENTIAL_RESOLUTION_FAILED', path, 'credential resolution failed')
    }
    resolved.set(reference, value)
  }))
  return { resolve: reference => resolved.get(reference) }
}

async function materializeClaudeAssets(
  mcpSet: EngineMcpSet | undefined,
  skillSet: EngineSkillSet | undefined,
  resolver: EngineSuiteCredentialResolver | undefined,
  mcpMaterializer: ClaudeMcpMaterializer,
  skillMaterializer: ClaudeSkillMaterializer,
): Promise<Pick<ClaudeAdapterOptions, 'mcpServers' | 'skillPlugins' | 'additionalDirectories'>> {
  const canonicalMcp = mcpSet === undefined ? undefined : canonicalMcpSet(mcpSet)
  const credentialResolver = canonicalMcp === undefined
    ? undefined
    : await materializerCredentialResolver(canonicalMcp, resolver)
  const mcpOptions = canonicalMcp === undefined
    ? {}
    : mcpMaterializer(canonicalMcp, credentialResolver === undefined ? {} : { credentialResolver })
  const skillOptions = skillSet === undefined
    ? {}
    : skillMaterializer({
      scope: 'user',
      pluginDirs: [...skillSet.pluginDirs],
      additionalDirectories: [...skillSet.additionalDirectories],
    })
  return {
    ...mcpOptions,
    ...(skillOptions.plugins === undefined ? {} : { skillPlugins: skillOptions.plugins.map(plugin => plugin.path) }),
    ...(skillOptions.additionalDirectories === undefined ? {} : { additionalDirectories: skillOptions.additionalDirectories }),
  }
}

export function createEngineSuiteRuntime(options: CreateEngineSuiteRuntimeOptions = {}): EngineSuiteRuntime {
  const claudeSessionFactory = options.claudeSessionFactory ?? createClaudeProviderSession
  const credentialResolver = options.credentialResolver
  const claudeMcpMaterializer = options.claudeMcpMaterializer ?? materializeClaudeMcpOptions
  const claudeSkillMaterializer = options.claudeSkillMaterializer ?? materializeClaudeSkills
  const configuredClaudeSdkGateway = options.claudeSdkGateway
  const claudeSdkGateway = configuredClaudeSdkGateway ?? realClaudeSdkGateway
  const claudeArchiveStore = options.claudeArchiveStore ?? createClaudeArchiveStore()
  const engines = new EngineRegistry()
  engines.register(CODEX_ENGINE)
  engines.register(CLAUDE_ENGINE)
  const providers = new ProviderRegistry()
  const models = new ClaudePolicyModelCatalog()
  const profiles = new EngineProfileCatalog()
  const assets = new EngineAssetRegistry()
  const resolveProfile = (selection: EngineSelection): EngineProfileSnapshot => {
    models.assertSelectionAllowed(selection)
    return resolveEngineProfile(
      { engines, providers, models },
    selection,
      profileResolverOptions(profiles.find(selection)),
    )
  }

  const runtime: EngineSuiteRuntime = {
    engines,
    providers,
    models,
    profiles,
    assets,
    claudeArchiveStore,
    resolveProfile,
    listClaudeSessions: async (input = {}) => listClaudeSessionDescriptors(claudeSdkGateway, input),
    getClaudeSessionHistory: (handle, input = {}) => getClaudeSessionHistory(claudeSdkGateway, handle, input),
    importClaudeSession: input => importClaudeSessionToStore(claudeSdkGateway, input),
    archiveClaudeSession: (handle, archivedAt) => {
      const valid = normalizeClaudePersistenceHandle(handle)
      claudeArchiveStore.remember(valid)
      return archivedAt === undefined ? claudeArchiveStore.archive(valid) : claudeArchiveStore.archive(valid, archivedAt)
    },
    unarchiveClaudeSession: handle => claudeArchiveStore.unarchive(normalizeClaudePersistenceHandle(handle)),
    resumeClaudeSession: async (selection, input) => {
      const handle = normalizeClaudePersistenceHandle(input.handle)
      const { handle: _handle, cwd: requestedCwd, ...openOptions } = input
      return runtime.openEngine(selection, {
        ...openOptions,
        cwd: requestedCwd ?? handle.cwd,
        ...(handle.runtimeRoot === undefined || openOptions.runtimeRoot !== undefined ? {} : { runtimeRoot: handle.runtimeRoot }),
        resumeThreadId: handle.nativeHandle,
      })
    },
    reconnectClaudeSession: async (selection, input) => {
      const handle = normalizeClaudePersistenceHandle(input.handle)
      const { handle: _handle, cwd: requestedCwd, ...openOptions } = input
      return runtime.openEngine(selection, {
        ...openOptions,
        cwd: requestedCwd ?? handle.cwd,
        ...(handle.runtimeRoot === undefined || openOptions.runtimeRoot !== undefined ? {} : { runtimeRoot: handle.runtimeRoot }),
        resumeThreadId: handle.nativeHandle,
      })
    },
    discoverCodexModels: async (providerId, options) => {
      const provider = providers.get(providerId)
      const discovered = await discoverCodexModels({ ...options, provider } satisfies CodexModelDiscoveryOptions)
      models.replaceProvider(providerId, discovered)
      return discovered
    },
    discoverClaudeModels: async (providerId, options) => {
      const provider = providers.get(providerId)
      if (provider.engineId !== 'claude-cli') throw new Error(`provider is not a Claude provider: ${provider.id}`)
      if (options.apiKey.trim().length === 0) throw new Error('Claude API key must not be empty')
      const session = claudeSessionFactory({
        cwd: options.cwd,
        baseUri: provider.baseUri,
        authToken: options.apiKey,
        persistSession: false,
        ...(options.executable === undefined ? {} : { executablePath: options.executable }),
        ...(options.args === undefined ? {} : { commandArgs: options.args }),
        ...(options.catalogTtlMs === undefined ? {} : { catalogTtlMs: options.catalogTtlMs }),
      })
      try {
        const catalog = await session.refreshCatalog()
        const discovered = catalog.models
          .map(model => toClaudeModelRecord(providerId, model))
          .filter((model): model is CreateModelInput => model !== undefined)
        models.replaceProvider(providerId, discovered.map(model => ({
          ...model,
          enabled: true,
          hidden: false,
          reasoningOptions: model.reasoningOptions ?? [],
          inputModalities: model.inputModalities ?? ['text'],
          contextWindowSource: model.contextWindowSource ?? 'unknown',
          source: 'discovered' as const,
        })))
        return models.list(providerId)
      } finally {
        await session.close()
      }
    },
    openCodex: async (selection, options) => {
      const profile = resolveProfile(selection)
      const provider = providers.get(profile.providerId)
      const model = models.get(profile.modelRecordId)
      const mcpSet = options.mcpSet ?? (profile.mcpSetRef === undefined ? undefined : assets.mcpSet(profile.mcpSetRef))
      const skillSet = options.skillSet ?? (profile.skillSetRef === undefined ? undefined : assets.skillSet(profile.skillSetRef))
      const codexAssets = codexMcpSet(mcpSet, options.internalMcpSet)
      const credentialResolverForLaunch = options.credentialResolver ?? credentialResolver
      const {
        mcpSet: _mcpSet,
        skillSet: _skillSet,
        internalMcpSet: _internalMcpSet,
        credentialResolver: _credentialResolver,
        sessionStore: _sessionStore,
        sessionStoreFlush: _sessionStoreFlush,
        ...codexOptions
      } = options
      return openCodexLaunch({
        ...codexOptions,
        profile,
        provider,
        model,
        ...codexAssets === undefined ? {} : { mcpSet: codexAssets },
        ...skillSet === undefined ? {} : { skillSet },
        ...credentialResolverForLaunch === undefined ? {} : { credentialResolver: credentialResolverForLaunch },
      } satisfies CodexLaunchOptions)
    },
    openEngine: async (selection, options) => {
      const profile = resolveProfile(selection)
      const provider = providers.get(profile.providerId)
      const model = models.get(profile.modelRecordId)
      const mcpSet = options.mcpSet ?? (profile.mcpSetRef === undefined ? undefined : assets.mcpSet(profile.mcpSetRef))
      const skillSet = options.skillSet ?? (profile.skillSetRef === undefined ? undefined : assets.skillSet(profile.skillSetRef))
      if (profile.engineId === 'codex-cli') {
        const codexAssets = codexMcpSet(mcpSet, options.internalMcpSet)
        const credentialResolverForLaunch = options.credentialResolver ?? credentialResolver
        const {
          mcpSet: _mcpSet,
          skillSet: _skillSet,
          internalMcpSet: _internalMcpSet,
          credentialResolver: _credentialResolver,
          sessionStore: _sessionStore,
          sessionStoreFlush: _sessionStoreFlush,
          ...codexOptions
        } = options
        const launch = await openCodexLaunch({
          ...codexOptions,
          profile,
          provider,
          model,
          ...codexAssets === undefined ? {} : { mcpSet: codexAssets },
          ...skillSet === undefined ? {} : { skillSet },
          ...credentialResolverForLaunch === undefined ? {} : { credentialResolver: credentialResolverForLaunch },
        } satisfies CodexLaunchOptions)
        return {
          runtime: launch.runtime,
          profile: launch.profile,
          runtimeRoot: launch.runtimeRoot,
          nativeSessionId: launch.runtime.threadId ?? '',
          close: launch.close,
        }
      }
      if (profile.engineId === 'claude-cli') {
        assertClaudeModelAllowed(model.modelId)
        const permissionModes = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'] as const
        const permissionMode = permissionModes.includes(options.permissionPreset as typeof permissionModes[number])
          ? options.permissionPreset as typeof permissionModes[number]
          : 'default'
        const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(profile.reasoningEffort ?? '')
          ? profile.reasoningEffort as ClaudeAdapterOptions['effort']
          : undefined
        const assetOptions = await materializeClaudeAssets(
          mcpSet,
          skillSet,
          options.credentialResolver ?? credentialResolver,
          claudeMcpMaterializer,
          claudeSkillMaterializer,
        )
        const claudeOptions: ClaudeAdapterOptions = {
          cwd: options.cwd,
          model: model.modelId,
          ...(effort === undefined ? {} : { effort }),
          permissionMode,
          ...(provider.baseUri === undefined ? {} : { baseUri: provider.baseUri }),
          ...(options.apiKey === undefined ? {} : { authToken: options.apiKey }),
          ...(options.executable === undefined ? {} : { executablePath: options.executable }),
          ...(options.args === undefined ? {} : { commandArgs: options.args }),
          ...(options.environment === undefined ? {} : { environment: options.environment }),
          ...(options.resumeThreadId === undefined ? {} : { resumeSessionId: options.resumeThreadId }),
          ...assetOptions,
          ...(options.sessionStore === undefined ? {} : { sessionStore: options.sessionStore }),
          ...(options.sessionStoreFlush === undefined ? {} : { sessionStoreFlush: options.sessionStoreFlush }),
          ...(configuredClaudeSdkGateway === undefined ? {} : { persistenceGateway: claudeSdkGateway }),
          persistSession: true,
        }
        const session = claudeSessionFactory(claudeOptions)
        const runtime = new ClaudeSessionRuntimeBridge(session)
        try {
          await runtime.whenReady()
          const nativeSessionId = session.sessionId ?? session.persistenceHandle()?.nativeHandle
          if (nativeSessionId === undefined || nativeSessionId.length === 0) {
            throw new Error('Claude session initialized without a native session id')
          }
          return {
            runtime,
            profile,
            runtimeRoot: options.runtimeRoot ?? '',
            nativeSessionId,
            close: () => runtime.close(),
          }
        } catch (error) {
          await runtime.close().catch(() => undefined)
          throw error
        }
      }
      throw new Error(`unsupported Engine Suite engine: ${profile.engineId}`)
    },
  }
  return runtime
}

export function createEngineSuite(): EngineSuite {
  return createEngineSuiteRuntime()
}
