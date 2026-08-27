import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactElement } from 'react'
import type { EngineSuiteCatalogController } from './catalog.js'
import type { EngineSuiteModelView } from '../types.js'
import type { EngineSuiteMcpServerSettings, EngineSuiteMcpSetSettings, EngineSuiteModelSettings, EngineSuiteProfileSettings, EngineSuiteProviderSettings, EngineSuiteSettings, EngineSuiteSkillSetSettings } from '../settings.js'

export interface EngineSuiteSectionProps {
  readonly close: () => void
  readonly scope: SettingsScope<EngineSuiteSettings>
  readonly catalog: EngineSuiteCatalogController
}

function useSettings(scope: SettingsScope<EngineSuiteSettings>): SettingsScopeSnapshot<EngineSuiteSettings> {
  const [snapshot, setSnapshot] = useState(scope.getSnapshot())
  useEffect(() => {
    setSnapshot(scope.getSnapshot())
    return scope.subscribe(() => setSnapshot(scope.getSnapshot()))
  }, [scope])
  return snapshot
}

function useCatalog(controller: EngineSuiteCatalogController) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
}

function upsertProvider(
  providers: readonly EngineSuiteProviderSettings[],
  input: EngineSuiteProviderSettings,
): EngineSuiteProviderSettings[] {
  const existing = providers.findIndex(provider => provider.id === input.id)
  if (existing < 0) return [...providers, input]
  const next = [...providers]
  next[existing] = input
  return next
}

function upsertModel(
  models: readonly EngineSuiteModelSettings[],
  input: EngineSuiteModelSettings,
): EngineSuiteModelSettings[] {
  const existing = models.findIndex(model => model.id === input.id)
  if (existing < 0) return [...models, input]
  const next = [...models]
  next[existing] = input
  return next
}

function upsertProfile(
  profiles: readonly EngineSuiteProfileSettings[],
  input: EngineSuiteProfileSettings,
): EngineSuiteProfileSettings[] {
  const existing = profiles.findIndex(profile => profile.id === input.id)
  if (existing < 0) return [...profiles, input]
  const next = [...profiles]
  next[existing] = input
  return next
}

function upsertSkillSet(sets: readonly EngineSuiteSkillSetSettings[], input: EngineSuiteSkillSetSettings): EngineSuiteSkillSetSettings[] {
  const existing = sets.findIndex(set => set.id === input.id)
  if (existing < 0) return [...sets, input]
  const next = [...sets]
  next[existing] = input
  return next
}

function upsertMcpSet(sets: readonly EngineSuiteMcpSetSettings[], input: EngineSuiteMcpSetSettings): EngineSuiteMcpSetSettings[] {
  const existing = sets.findIndex(set => set.id === input.id)
  if (existing < 0) return [...sets, input]
  const next = [...sets]
  next[existing] = input
  return next
}

function modelFromCatalog(model: EngineSuiteModelView): EngineSuiteModelSettings {
  return {
    id: model.id,
    engineId: model.engineId,
    providerId: model.providerId,
    modelId: model.modelId,
    ...model.displayName === undefined ? {} : { displayName: model.displayName },
    enabled: model.enabled,
    hidden: model.hidden,
    reasoningOptions: model.reasoningOptions.map(option => option.id),
    ...model.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
    ...model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens },
    contextWindowSource: model.contextWindowSource as EngineSuiteModelSettings['contextWindowSource'],
  }
}

export function EngineSuiteSection({ scope, catalog: controller }: EngineSuiteSectionProps): ReactElement {
  const snapshot = useSettings(scope)
  const catalog = useCatalog(controller)
  const providers = snapshot.value?.providers ?? []
  const models = snapshot.value?.models ?? []
  const profiles = snapshot.value?.profiles ?? []
  const skillSets = snapshot.value?.skillSets ?? []
  const mcpSets = snapshot.value?.mcpSets ?? []
  const [engineId, setEngineId] = useState('claude-cli')
  const [providerId, setProviderId] = useState('glm-opencodebay')
  const [providerName, setProviderName] = useState('GLM (OpenCodeBay)')
  const [baseUri, setBaseUri] = useState('https://sub2api.opencodebay.com')
  const [credentialRef, setCredentialRef] = useState('ANTHROPIC_AUTH_TOKEN')
  const [modelRecordId, setModelRecordId] = useState('glm-opencodebay/glm-5.3')
  const [modelId, setModelId] = useState('glm-5.3')
  const [displayName, setDisplayName] = useState('GLM 5.3')
  const [reasoningOptions, setReasoningOptions] = useState('low,medium,high,xhigh,max')
  const [defaultReasoningEffort, setDefaultReasoningEffort] = useState('max')
  const [contextWindowTokens, setContextWindowTokens] = useState('')
  const [is1M, setIs1M] = useState(false)
  const [profileId, setProfileId] = useState('')
  const [profileName, setProfileName] = useState('')
  const [allowedChildProfiles, setAllowedChildProfiles] = useState('')
  const [maxChildDepth, setMaxChildDepth] = useState('1')
  const [maxConcurrentChildren, setMaxConcurrentChildren] = useState('1')
  const [skillSetRef, setSkillSetRef] = useState('')
  const [mcpSetRef, setMcpSetRef] = useState('')
  const [skillSetId, setSkillSetId] = useState('')
  const [skillPluginDirs, setSkillPluginDirs] = useState('')
  const [skillAdditionalDirectories, setSkillAdditionalDirectories] = useState('')
  const [mcpSetId, setMcpSetId] = useState('')
  const [mcpServerId, setMcpServerId] = useState('engine-suite-server')
  const [mcpServerName, setMcpServerName] = useState('Engine Suite MCP Server')
  const [mcpTransport, setMcpTransport] = useState<'stdio' | 'http'>('stdio')
  const [mcpCommand, setMcpCommand] = useState('')
  const [mcpArgs, setMcpArgs] = useState('')
  const [mcpUrl, setMcpUrl] = useState('')
  const [message, setMessage] = useState<string | undefined>()

  const catalogProviders = catalog.catalog?.providers.filter(provider => provider.engineId === engineId) ?? []
  const catalogModels = catalog.catalog?.models.filter(model => model.providerId === providerId) ?? []
  const writable = snapshot.status === 'ready' && snapshot.writable

  useEffect(() => {
    const configured = providers.find(provider => provider.id === providerId)
    if (configured !== undefined) {
      setProviderName(configured.name)
      setBaseUri(configured.baseUri)
      setCredentialRef(configured.credentialRef)
      return
    }
    const discovered = catalogProviders.find(provider => provider.id === providerId)
    if (discovered === undefined) return
    setProviderName(discovered.name)
    setBaseUri(discovered.baseUri)
  }, [catalogProviders, providerId, providers])

  useEffect(() => {
    const configured = models.find(model => model.id === modelRecordId)
    const discovered = catalogModels.find(model => model.id === modelRecordId)
    const selected = configured ?? discovered
    if (selected === undefined) return
    setModelId(selected.modelId)
    setDisplayName(selected.displayName ?? '')
    setReasoningOptions(selected.reasoningOptions.join(','))
    setDefaultReasoningEffort(selected.defaultReasoningEffort ?? '')
    setContextWindowTokens(selected.contextWindowTokens === undefined ? '' : String(selected.contextWindowTokens))
    setIs1M(selected.contextWindowTokens === 1_000_000)
  }, [catalogModels, modelRecordId, models])

  const saveProvider = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const provider: EngineSuiteProviderSettings = {
      id: providerId.trim(),
      engineId,
      name: providerName.trim(),
      baseUri: baseUri.trim(),
      credentialRef: credentialRef.trim(),
      wireApi: engineId === 'claude-cli' ? 'anthropic' : 'responses',
      authMode: engineId === 'claude-cli' ? 'auth-token' : 'api-key',
      enabled: true,
    }
    try {
      await scope.set('providers', upsertProvider(providers, provider))
      await controller.refresh().catch(() => undefined)
      setMessage(`Saved provider ${provider.id}`)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const saveModel = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const options = reasoningOptions.split(',').map(value => value.trim()).filter(Boolean)
    const model: EngineSuiteModelSettings = {
      id: modelRecordId.trim(),
      engineId,
      providerId: providerId.trim(),
      modelId: modelId.trim(),
      ...displayName.trim() === '' ? {} : { displayName: displayName.trim() },
      enabled: true,
      hidden: false,
      reasoningOptions: options,
      ...defaultReasoningEffort.trim() === '' ? {} : { defaultReasoningEffort: defaultReasoningEffort.trim() },
      ...contextWindowTokens.trim() === '' ? {} : {
        contextWindowTokens: Number(contextWindowTokens),
        contextWindowSource: 'manual' as const,
      },
      contextWindowSource: contextWindowTokens.trim() === '' ? 'unknown' : 'manual',
    }
    try {
      await scope.set('models', upsertModel(models, model))
      await controller.refresh().catch(() => undefined)
      setMessage(`Saved model ${model.modelId}`)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const saveProfile = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const id = profileId.trim()
    if (id === '') {
      setMessage('Profile ID is required')
      return
    }
    const profile: EngineSuiteProfileSettings = {
      id,
      ...profileName.trim() === '' ? {} : { name: profileName.trim() },
      engineId,
      providerId: providerId.trim(),
      modelRecordId: modelRecordId.trim(),
      ...defaultReasoningEffort.trim() === '' ? {} : { reasoningEffort: defaultReasoningEffort.trim() },
      ...skillSetRef.trim() === '' ? {} : { skillSetRef: skillSetRef.trim() },
      ...mcpSetRef.trim() === '' ? {} : { mcpSetRef: mcpSetRef.trim() },
      allowedChildProfiles: allowedChildProfiles.split(',').map(value => value.trim()).filter(Boolean),
      maxChildDepth: Number(maxChildDepth),
      maxConcurrentChildren: Number(maxConcurrentChildren),
      enabled: true,
    }
    try {
      await scope.set('profiles', upsertProfile(profiles, profile))
      setMessage(`Saved profile ${profile.id}`)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const saveSkillSet = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const id = skillSetId.trim()
    if (id === '') { setMessage('Skill set ID is required'); return }
    const set: EngineSuiteSkillSetSettings = {
      id,
      pluginDirs: skillPluginDirs.split('\n').map(value => value.trim()).filter(Boolean),
      additionalDirectories: skillAdditionalDirectories.split('\n').map(value => value.trim()).filter(Boolean),
    }
    try {
      await scope.set('skillSets', upsertSkillSet(skillSets, set))
      setMessage(`Saved skill set ${set.id}`)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const saveMcpSet = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const id = mcpSetId.trim()
    if (id === '') { setMessage('MCP set ID is required'); return }
    const serverId = mcpServerId.trim()
    const serverName = mcpServerName.trim()
    if (serverId === '' || serverName === '') {
      setMessage('MCP server ID and name are required')
      return
    }
    let server: EngineSuiteMcpServerSettings
    if (mcpTransport === 'stdio') {
      const command = mcpCommand.trim()
      if (command === '') {
        setMessage('MCP command is required for stdio transport')
        return
      }
      const args = mcpArgs.split(',').map(value => value.trim()).filter(Boolean)
      server = {
        id: serverId,
        name: serverName,
        transport: 'stdio',
        command,
        ...(args.length === 0 ? {} : { args }),
      }
    } else {
      const url = mcpUrl.trim()
      if (url === '') {
        setMessage('MCP URL is required for HTTP transport')
        return
      }
      server = { id: serverId, name: serverName, transport: 'http', url }
    }
    const set: EngineSuiteMcpSetSettings = { id, servers: [server] }
    try {
      await scope.set('mcpSets', upsertMcpSet(mcpSets, set))
      setMessage(`Saved MCP set ${set.id}`)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const discover = async (): Promise<void> => {
    if (providerId.trim() === '') return
    setMessage('Discovering models…')
    try {
      const discovered = await controller.discoverModels(providerId.trim())
      const discoveredSettings = discovered.map(modelFromCatalog)
      if (discoveredSettings.length > 0) {
        await scope.set('models', [
          ...models.filter(model => model.providerId !== providerId),
          ...discoveredSettings,
        ])
        const first = discoveredSettings[0]
        if (first === undefined) throw new Error('model discovery returned no model')
        setModelRecordId(first.id)
        setModelId(first.modelId)
        setDisplayName(first.displayName ?? '')
        setReasoningOptions(first.reasoningOptions.join(','))
        setDefaultReasoningEffort(first.defaultReasoningEffort ?? '')
        setContextWindowTokens(first.contextWindowTokens === undefined ? '' : String(first.contextWindowTokens))
        setIs1M(first.contextWindowTokens === 1_000_000)
      }
      setMessage(`Discovered ${discovered.length} model(s)`)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const currentProviderModels = catalog.catalog?.models.filter(model => model.providerId === providerId) ?? []

  return (
    <section aria-labelledby="engine-suite-settings-title">
      <h2 id="engine-suite-settings-title">Engine Suite</h2>
      <p>Configure the three-level route: engine → provider → model and reasoning effort.</p>
      <p data-status={snapshot.status}>Settings status: {snapshot.status}</p>
      <p>Configured providers: {providers.length}</p>
      <p>Configured models: {models.length}</p>
      <p>Configured profiles: {profiles.length}</p>
      <p>Configured Skill sets: {skillSets.length} · MCP sets: {mcpSets.length}</p>
      {catalog.status === 'error' ? <p role="alert">Catalog: {catalog.error}</p> : null}
      {message === undefined ? null : <p role="status">{message}</p>}

      <form onSubmit={saveProvider}>
        <h3>1. Engine and provider</h3>
        <label>
          Engine
          <select value={engineId} onChange={event => setEngineId(event.target.value)} disabled={!writable}>
            {(catalog.catalog?.engines ?? []).map(engine => <option key={engine.id} value={engine.id}>{engine.displayName}</option>)}
          </select>
        </label>
        <label>
          Provider
          <select value={providerId} onChange={event => setProviderId(event.target.value)} disabled={!writable}>
            {[...new Set([
              ...catalogProviders.map(provider => provider.id),
              ...providers.filter(provider => provider.engineId === engineId).map(provider => provider.id),
            ])].map(id => {
              const provider = catalogProviders.find(candidate => candidate.id === id)
                ?? providers.find(candidate => candidate.id === id)
              return <option key={id} value={id}>{provider?.name ?? id}</option>
            })}
          </select>
        </label>
        <label>
          Provider ID
          <input value={providerId} onChange={event => setProviderId(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Name
          <input value={providerName} onChange={event => setProviderName(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Base URI
          <input value={baseUri} onChange={event => setBaseUri(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Credential reference
          <input value={credentialRef} onChange={event => setCredentialRef(event.target.value)} disabled={!writable} />
        </label>
        <button type="submit" disabled={!writable}>Save provider</button>
      </form>

      <form onSubmit={saveModel}>
        <h3>2. Model and reasoning</h3>
        <label>
          Discovered model
          <select
            value={modelRecordId}
            onChange={event => setModelRecordId(event.target.value)}
            disabled={!writable || currentProviderModels.length === 0}
          >
            {currentProviderModels.map(model => <option key={model.id} value={model.id}>{model.displayName ?? model.modelId}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void discover()} disabled={!writable || providerId.trim() === ''}>Explore model list</button>
        <label>
          Model record ID
          <input value={modelRecordId} onChange={event => setModelRecordId(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Model ID
          <input value={modelId} onChange={event => setModelId(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Display name
          <input value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Reasoning options (comma-separated)
          <input value={reasoningOptions} onChange={event => setReasoningOptions(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Default reasoning effort
          <input value={defaultReasoningEffort} onChange={event => setDefaultReasoningEffort(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Context window tokens
          <input value={contextWindowTokens} onChange={event => { setContextWindowTokens(event.target.value); setIs1M(Number(event.target.value) === 1_000_000) }} disabled={!writable || is1M} />
        </label>
        <label>
          <input type="checkbox" checked={is1M} onChange={event => { setIs1M(event.target.checked); setContextWindowTokens(event.target.checked ? '1000000' : '') }} disabled={!writable} />
          1M context model
        </label>
        <button type="submit" disabled={!writable || modelId.trim() === ''}>Save model</button>
      </form>

      <details>
        <summary>Advanced Agent Profile (MCP / Skill / child Agent policy)</summary>
        <form onSubmit={saveProfile}>
          <label>
            Profile ID
            <input value={profileId} onChange={event => setProfileId(event.target.value)} disabled={!writable} />
          </label>
          <label>
            Profile name
            <input value={profileName} onChange={event => setProfileName(event.target.value)} disabled={!writable} />
          </label>
          <label>
            Allowed child profile IDs (comma-separated)
            <input value={allowedChildProfiles} onChange={event => setAllowedChildProfiles(event.target.value)} disabled={!writable} />
          </label>
          <label>
            Max child depth
            <input type="number" min="0" step="1" value={maxChildDepth} onChange={event => setMaxChildDepth(event.target.value)} disabled={!writable} />
          </label>
          <label>
            Max concurrent children
            <input type="number" min="1" step="1" value={maxConcurrentChildren} onChange={event => setMaxConcurrentChildren(event.target.value)} disabled={!writable} />
          </label>
          <label>
            Skill set reference
            <input value={skillSetRef} onChange={event => setSkillSetRef(event.target.value)} disabled={!writable} />
          </label>
          <label>
            MCP set reference
            <input value={mcpSetRef} onChange={event => setMcpSetRef(event.target.value)} disabled={!writable} />
          </label>
          <button type="submit" disabled={!writable}>Save profile</button>
        </form>
      </details>

      <details>
        <summary>Runtime Assets (Skill / MCP)</summary>
        <form onSubmit={saveSkillSet}>
          <h4>Skill set</h4>
          <label>Skill set ID<input value={skillSetId} onChange={event => setSkillSetId(event.target.value)} disabled={!writable} /></label>
          <label>Plugin directories (one per line)<textarea value={skillPluginDirs} onChange={event => setSkillPluginDirs(event.target.value)} disabled={!writable} /></label>
          <label>Additional directories (one per line)<textarea value={skillAdditionalDirectories} onChange={event => setSkillAdditionalDirectories(event.target.value)} disabled={!writable} /></label>
          <button type="submit" disabled={!writable}>Save Skill set</button>
        </form>
        <form onSubmit={saveMcpSet}>
          <h4>MCP set</h4>
          <label>MCP set ID<input value={mcpSetId} onChange={event => setMcpSetId(event.target.value)} disabled={!writable} /></label>
          <label>Server ID<input value={mcpServerId} onChange={event => setMcpServerId(event.target.value)} disabled={!writable} /></label>
          <label>Server name<input value={mcpServerName} onChange={event => setMcpServerName(event.target.value)} disabled={!writable} /></label>
          <label>Transport<select value={mcpTransport} onChange={event => setMcpTransport(event.target.value as 'stdio' | 'http')} disabled={!writable}><option value="stdio">stdio</option><option value="http">http</option></select></label>
          <label>Command<input value={mcpCommand} onChange={event => setMcpCommand(event.target.value)} disabled={!writable || mcpTransport !== 'stdio'} /></label>
          <label>Arguments (comma-separated)<input value={mcpArgs} onChange={event => setMcpArgs(event.target.value)} disabled={!writable || mcpTransport !== 'stdio'} /></label>
          <label>URL<input value={mcpUrl} onChange={event => setMcpUrl(event.target.value)} disabled={!writable || mcpTransport !== 'http'} /></label>
          <button type="submit" disabled={!writable}>Save MCP set</button>
        </form>
      </details>
    </section>
  )
}
