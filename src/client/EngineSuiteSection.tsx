import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import type { EngineSuiteModelSettings, EngineSuiteProviderSettings } from '../settings.js'
import type { EngineSuiteSettings } from '../settings.js'

export interface EngineSuiteSectionProps {
  readonly close: () => void
  readonly scope: SettingsScope<EngineSuiteSettings>
}

function useSettings(scope: SettingsScope<EngineSuiteSettings>): SettingsScopeSnapshot<EngineSuiteSettings> {
  const [snapshot, setSnapshot] = useState(scope.getSnapshot())
  useEffect(() => {
    setSnapshot(scope.getSnapshot())
    return scope.subscribe(() => setSnapshot(scope.getSnapshot()))
  }, [scope])
  return snapshot
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

export function EngineSuiteSection({ scope }: EngineSuiteSectionProps): ReactElement {
  const snapshot = useSettings(scope)
  const providers = snapshot.value?.providers ?? []
  const models = snapshot.value?.models ?? []
  const [providerId, setProviderId] = useState('debug-sub2api-codex')
  const [providerName, setProviderName] = useState('Debug Codex Relay')
  const [baseUri, setBaseUri] = useState('https://sub2api.opencodebay.com')
  const [credentialRef, setCredentialRef] = useState('debug-sub2api-codex')
  const [modelRecordId, setModelRecordId] = useState('debug-model')
  const [modelId, setModelId] = useState('')
  const [reasoningOptions, setReasoningOptions] = useState('low,medium,high')
  const [contextWindowTokens, setContextWindowTokens] = useState('')
  const [message, setMessage] = useState<string | undefined>()

  const writable = snapshot.status === 'ready' && snapshot.writable
  const saveProvider = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const provider: EngineSuiteProviderSettings = {
      id: providerId.trim(),
      engineId: 'codex-cli',
      name: providerName.trim(),
      baseUri: baseUri.trim(),
      credentialRef: credentialRef.trim(),
      enabled: true,
    }
    try {
      await scope.set('providers', upsertProvider(providers, provider))
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
      engineId: 'codex-cli',
      providerId: providerId.trim(),
      modelId: modelId.trim(),
      enabled: true,
      hidden: false,
      reasoningOptions: options,
      ...contextWindowTokens.trim() === '' ? {} : {
        contextWindowTokens: Number(contextWindowTokens),
        contextWindowSource: 'manual' as const,
      },
      contextWindowSource: contextWindowTokens.trim() === '' ? 'unknown' : 'manual',
    }
    try {
      await scope.set('models', upsertModel(models, model))
      setMessage(`Saved model ${model.modelId}`)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <section aria-labelledby="engine-suite-settings-title">
      <h2 id="engine-suite-settings-title">Engine Suite</h2>
      <p>Configure Codex providers and the manual model catalog used by new Agents.</p>
      <p data-status={snapshot.status}>Settings status: {snapshot.status}</p>
      <p>Configured providers: {providers.length}</p>
      <p>Configured models: {models.length}</p>
      {message === undefined ? null : <p role="status">{message}</p>}

      <form onSubmit={saveProvider}>
        <h3>Codex provider</h3>
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
        <h3>Manual model</h3>
        <label>
          Model record ID
          <input value={modelRecordId} onChange={event => setModelRecordId(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Model ID
          <input value={modelId} onChange={event => setModelId(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Reasoning options (comma-separated)
          <input value={reasoningOptions} onChange={event => setReasoningOptions(event.target.value)} disabled={!writable} />
        </label>
        <label>
          Context window tokens (optional; use 1000000 for 1M)
          <input value={contextWindowTokens} onChange={event => setContextWindowTokens(event.target.value)} disabled={!writable} />
        </label>
        <button type="submit" disabled={!writable || modelId.trim() === ''}>Save model</button>
      </form>
    </section>
  )
}
