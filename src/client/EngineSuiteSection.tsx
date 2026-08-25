import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { useEffect, useState, type ReactElement } from 'react'
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

export function EngineSuiteSection({ scope }: EngineSuiteSectionProps): ReactElement {
  const snapshot = useSettings(scope)
  const providers = snapshot.value?.providers ?? []
  const models = snapshot.value?.models ?? []
  return (
    <section aria-labelledby="engine-suite-settings-title">
      <h2 id="engine-suite-settings-title">Engine Suite</h2>
      <p>Configure the engine, provider, model, and reasoning profile used by new Agents.</p>
      <p data-status={snapshot.status}>Settings status: {snapshot.status}</p>
      <p>Configured providers: {providers.length}</p>
      <p>Configured models: {models.length}</p>
      {providers.length === 0 ? <p>No engine providers configured yet.</p> : null}
      {models.length === 0 ? <p>Discover or add a model after configuring a provider.</p> : null}
    </section>
  )
}
