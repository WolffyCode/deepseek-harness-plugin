import type { EngineSuiteCreateAgentRequest, EngineSuiteEngineView, EngineSuiteModelView, EngineSuiteProviderView, EngineSuiteSelectionRequest } from '../types.js'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineSuiteAgentPresetFace } from './agent-preset.js'
import { presetDisplayName } from './agent-preset.js'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { getEngineSuiteComposerRuntime, getEngineSuiteSessionSelection } from './composer-runtime.js'
import { defaultReasoningEffort, enabledModels, enabledProviders, engineSelectionLocked, filterEngineOptions, filterModelOptions, filterProviderOptions, resolveEngineSelection, resolveModelSelection, resolveProviderSelection } from './composer-selection.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement } from 'react'

export interface EngineSuiteComposerSelectorProps {
  readonly locked: boolean
  readonly useSession: SnapshotSelectorHook<ConversationSnapshot>
  readonly sessionId: string
  readonly useSessions: SnapshotSelectorHook<SessionListState>
  readonly agentPreset?: EngineSuiteAgentPresetFace
}

type AnchorRect = { readonly left: number; readonly right: number; readonly top: number }

type IconName = 'spark' | 'chevron' | 'check' | 'engine' | 'provider' | 'model' | 'reasoning' | 'close' | 'search'

const EMPTY_SNAPSHOT = {
  status: 'idle' as const,
  catalog: null,
  error: null,
}
const EMPTY_SUBSCRIBE = (): (() => void) => () => undefined
const EMPTY_SNAPSHOT_GETTER = () => EMPTY_SNAPSHOT

function displayModel(model: EngineSuiteModelView): string {
  return model.displayName ?? model.modelId
}

function contextLabel(model: EngineSuiteModelView): string | undefined {
  const tokens = model.contextWindowTokens
  if (tokens === undefined) return undefined
  if (tokens >= 1_000_000) return '1M 上下文'
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K 上下文`
  return `${tokens} tokens`
}

function engineMeta(engine: EngineSuiteEngineView): string {
  if (engine.type === 'deepseek-native') return 'DeepSeek 内置'
  if (engine.type === 'claude-cli') return '本地 Claude CLI'
  if (engine.type === 'codex-cli') return '本地 Codex CLI'
  return 'Harness 引擎'
}

function providerMeta(provider: EngineSuiteProviderView): string {
  return provider.baseUri === '' ? 'DeepSeek 内置服务' : provider.baseUri.replace(/^https?:\/\//u, '')
}

function Icon({ name, size = 16 }: { readonly name: IconName; readonly size?: number }): ReactElement {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'spark') return <svg {...common}><path d="m12 3 1.65 5.35L19 10l-5.35 1.65L12 17l-1.65-5.35L5 10l5.35-1.65L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></svg>
  if (name === 'chevron') return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>
  if (name === 'check') return <svg {...common}><path d="m5 12 4.2 4.2L19 6.5" /></svg>
  if (name === 'engine') return <svg {...common}><path d="M4 6.5h16M4 12h16M4 17.5h16" /><circle cx="8" cy="6.5" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="10" cy="17.5" r="1.5" /></svg>
  if (name === 'provider') return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5s-1.1 6.2-3.2 8.5c-2.1-2.3-3.2-6.2-3.2-8.5S9.9 5.8 12 3.5Z" /></svg>
  if (name === 'model') return <svg {...common}><path d="M6.5 4.5h11A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17V7a2.5 2.5 0 0 1 2.5-2.5Z" /><path d="M8 9h8M8 13h5" /></svg>
  if (name === 'reasoning') return <svg {...common}><path d="M9.5 18.5h5M10 21h4M8.7 15.5A6.5 6.5 0 1 1 15.3 15c-.8.6-1.1 1.2-1.2 2h-4.2c-.1-.7-.4-1.2-1.2-1.5Z" /><path d="M12 2v1.5M4.9 4.9 6 6M19.1 4.9 18 6" /></svg>
  if (name === 'search') return <svg {...common}><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.2 4.2" /></svg>
  return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function optionStyle(selected: boolean): CSSProperties {
  return {
    alignItems: 'center',
    background: selected ? 'color-mix(in srgb, var(--engine-suite-accent) 8%, transparent)' : 'transparent',
    border: selected ? '1px solid color-mix(in srgb, var(--engine-suite-accent) 38%, transparent)' : '1px solid transparent',
    borderRadius: 9,
    color: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    gap: 8,
    minHeight: 42,
    padding: '7px 8px',
    textAlign: 'left',
    width: '100%',
  }
}

export function EngineSuiteComposerSelector({
  locked,
  useSession,
  sessionId,
  useSessions,
  agentPreset,
}: EngineSuiteComposerSelectorProps): ReactElement | null {
  const runtime = getEngineSuiteComposerRuntime()
  const catalog = runtime?.catalog
  const snapshot = useSyncExternalStore(
    catalog?.subscribe ?? EMPTY_SUBSCRIBE,
    catalog?.getSnapshot ?? EMPTY_SNAPSHOT_GETTER,
    catalog?.getSnapshot ?? EMPTY_SNAPSHOT_GETTER,
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const sessionSummary = useSessions(state => state.byId[sessionId])
  const engineLocked = engineSelectionLocked(locked, sessionSummary?.blank)
  const [presetOptions, setPresetOptions] = useState<readonly import('./agent-preset.js').EngineSuiteAgentPresetOption[]>([])
  const [presetId, setPresetId] = useState('')
  const [presetOpen, setPresetOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const persistedSelection = getEngineSuiteSessionSelection(sessionId)
  const [engineId, setEngineId] = useState(persistedSelection?.engineId ?? '')
  const [providerId, setProviderId] = useState(persistedSelection?.providerId ?? '')
  const [modelRecordId, setModelRecordId] = useState(persistedSelection?.modelRecordId ?? '')
  const [reasoningEffort, setReasoningEffort] = useState(persistedSelection?.reasoningEffort ?? '')
  const selectionSessionRef = useRef(sessionId)
  const [open, setOpen] = useState(false)
  const [panelClosing, setPanelClosing] = useState(false)
  const closeTimerRef = useRef<number | undefined>(undefined)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const [engineQuery, setEngineQuery] = useState('')
  const [providerQuery, setProviderQuery] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [selectionBusy, setSelectionBusy] = useState(false)
  const [selectionError, setSelectionError] = useState<string | undefined>()
  const automaticSelectionAttempt = useRef<string | undefined>()

  const engines = snapshot.catalog?.engines ?? []
  const providers = useMemo(
    () => snapshot.catalog === null ? [] : enabledProviders(snapshot.catalog, engineId),
    [snapshot.catalog?.providers, engineId],
  )
  const models = useMemo(
    () => snapshot.catalog === null ? [] : enabledModels(snapshot.catalog, providerId),
    [snapshot.catalog?.models, providerId],
  )
  const filteredEngines = useMemo(() => filterEngineOptions(engines, engineQuery), [engines, engineQuery])
  const filteredProviders = useMemo(() => filterProviderOptions(providers, providerQuery), [providers, providerQuery])
  const filteredModels = useMemo(() => filterModelOptions(models, modelQuery), [models, modelQuery])
  const selectedEngine = engines.find(engine => engine.id === engineId)
  const selectedProvider = providers.find(provider => provider.id === providerId)
  const selectedModel = models.find(model => model.id === modelRecordId)
  const reasoningOptions = selectedModel?.reasoningOptions ?? []
  const engineLabel = selectedEngine?.displayName ?? '选择引擎'
  const providerLabel = selectedProvider?.name ?? '未选择服务商'
  const modelLabel = selectedModel === undefined ? '未选择模型' : displayModel(selectedModel)
  const effortLabel = reasoningEffort === '' ? '默认' : reasoningEffort
  const showPreset = selectedEngine?.type === 'deepseek-native' && sessionSummary?.blank === true && agentPreset !== undefined
  useEffect(() => {
    if (selectionSessionRef.current === sessionId) return
    selectionSessionRef.current = sessionId
    const next = getEngineSuiteSessionSelection(sessionId)
    setEngineId(next?.engineId ?? '')
    setProviderId(next?.providerId ?? '')
    setModelRecordId(next?.modelRecordId ?? '')
    setReasoningEffort(next?.reasoningEffort ?? '')
    setEngineQuery('')
    setProviderQuery('')
    setModelQuery('')
    setSelectionError(undefined)
  }, [sessionId])
  useEffect(() => {
    if (selectedEngine?.type === 'deepseek-native') return
    if (providerId === '' || modelRecordId === '') return
    runtime?.setSessionSelection(sessionId, {
      engineId,
      providerId,
      modelRecordId,
      ...reasoningEffort === '' ? {} : { reasoningEffort },
    })
  }, [engineId, modelRecordId, providerId, reasoningEffort, runtime, selectedEngine?.type, sessionId])

  useEffect(() => {
    if (!showPreset || agentPreset === undefined) {
      setPresetOptions([])
      setPresetOpen(false)
      return
    }
    let cancelled = false
    void agentPreset.list().then(options => {
      if (cancelled) return
      setPresetOptions(options)
      const current = sessionSummary?.agentPreset ?? options.find(option => option.isDefault)?.id ?? options[0]?.id ?? ''
      setPresetId(current)
    }).catch(() => {
      if (!cancelled) setPresetOptions([])
    })
    return () => { cancelled = true }
  }, [agentPreset, sessionSummary?.agentPreset, showPreset])

  useEffect(() => {
    if (engineId !== '' && engines.some(candidate => candidate.id === engineId)) return
    const next = engines.find(candidate => snapshot.catalog !== null && enabledProviders(snapshot.catalog, candidate.id).length > 0) ?? engines[0]
    if (next !== undefined && next.id !== engineId) setEngineId(next.id)
  }, [engines, engineId, snapshot.catalog])

  useEffect(() => {
    if (providers.some(provider => provider.id === providerId)) return
    const nextProvider = providers[0]
    setProviderId(nextProvider?.id ?? '')
  }, [providers, providerId])

  useEffect(() => {
    if (models.some(model => model.id === modelRecordId)) return
    const nextModel = models[0]
    setModelRecordId(nextModel?.id ?? '')
    setReasoningEffort(defaultReasoningEffort(nextModel))
  }, [models, modelRecordId])

  useEffect(() => {
    if (selectedModel === undefined) {
      setReasoningEffort('')
      return
    }
    if (reasoningEffort !== '' && reasoningOptions.some(option => option.id === reasoningEffort)) return
    setReasoningEffort(defaultReasoningEffort(selectedModel))
  }, [selectedModel, reasoningEffort, reasoningOptions])

  const updateAnchor = useCallback((): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    setAnchor({ left: rect.left, right: rect.right, top: rect.top })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updateAnchor()
    const onViewportChange = (): void => updateAnchor()
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, updateAnchor])

  const closePanel = useCallback((): void => {
    if (!open || panelClosing) return
    setPanelClosing(true)
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      setPanelClosing(false)
      closeTimerRef.current = undefined
    }, 150)
  }, [open, panelClosing])

  useEffect(() => () => {
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        closePanel()
        setPresetOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (presetOpen) {
          setPresetOpen(false)
          return
        }
        closePanel()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closePanel, presetOpen])

  const applySelection = (selection: EngineSuiteSelectionRequest): void => {
    const engine = engines.find(candidate => candidate.id === selection.engineId)
    if (engine === undefined) return
    if (engine.type === 'deepseek-native') {
      runtime?.setSessionSelection(sessionId, selection)
      return
    }
    if (runtime === undefined) return
    if (locked || (engineLocked && selection.engineId !== engineId) || selection.providerId === '' || selection.modelRecordId === '') return
    setSelectionBusy(true)
    setSelectionError(undefined)
    const request: EngineSuiteCreateAgentRequest = {
      sessionId,
      selection,
      cwd: sessionSummary?.cwd ?? '',
    }
    void runtime.createAgent(request).then(
      () => {
        runtime.setSessionSelection(sessionId, selection)
        setSelectionBusy(false)
      },
      error => {
        setSelectionBusy(false)
        setSelectionError(error instanceof Error ? error.message : String(error))
      },
    )
  }

  useEffect(() => {
    if (sessionSummary?.blank !== true || runtime === undefined || snapshot.catalog === null || engineId === '' || providerId === '' || modelRecordId === '') return
    if (getEngineSuiteSessionSelection(sessionId) !== undefined || selectionBusy) return
    const selection: EngineSuiteSelectionRequest = {
      engineId,
      providerId,
      modelRecordId,
      ...reasoningEffort === '' ? {} : { reasoningEffort },
    }
    const attemptKey = [sessionId, selection.engineId, selection.providerId, selection.modelRecordId, selection.reasoningEffort ?? ''].join('\u0000')
    if (automaticSelectionAttempt.current === attemptKey) return
    automaticSelectionAttempt.current = attemptKey
    applySelection(selection)
  }, [engineId, modelRecordId, providerId, reasoningEffort, runtime, selectionBusy, sessionId, sessionSummary?.blank, snapshot.catalog])

  const currentSelection = (overrides: Partial<EngineSuiteSelectionRequest> = {}): EngineSuiteSelectionRequest => ({
    engineId,
    providerId,
    modelRecordId,
    ...reasoningEffort === '' ? {} : { reasoningEffort },
    ...overrides,
  })

  const chooseEngine = (nextEngineId: string): void => {
    if (snapshot.catalog === null || engineLocked) return
    const next = resolveEngineSelection(snapshot.catalog, nextEngineId)
    setEngineId(next.engineId)
    setProviderId(next.providerId)
    setModelRecordId(next.modelRecordId)
    setReasoningEffort(next.reasoningEffort)
    setProviderQuery('')
    setModelQuery('')
    applySelection({
      engineId: next.engineId,
      providerId: next.providerId,
      modelRecordId: next.modelRecordId,
      ...next.reasoningEffort === '' ? {} : { reasoningEffort: next.reasoningEffort },
    })
  }

  const chooseProvider = (nextProviderId: string): void => {
    if (snapshot.catalog === null) return
    const next = resolveProviderSelection(snapshot.catalog, engineId, nextProviderId)
    setProviderId(next.providerId)
    setModelRecordId(next.modelRecordId)
    setReasoningEffort(next.reasoningEffort)
    setModelQuery('')
    applySelection({
      engineId,
      providerId: next.providerId,
      modelRecordId: next.modelRecordId,
      ...next.reasoningEffort === '' ? {} : { reasoningEffort: next.reasoningEffort },
    })
  }

  const chooseModel = (nextModelId: string): void => {
    const next = resolveModelSelection(models, nextModelId)
    setModelRecordId(next.modelRecordId)
    setReasoningEffort(next.reasoningEffort)
    applySelection({
      engineId,
      providerId,
      modelRecordId: next.modelRecordId,
      ...next.reasoningEffort === '' ? {} : { reasoningEffort: next.reasoningEffort },
    })
    if (models.find(model => model.id === nextModelId)?.reasoningOptions.length === 0) closePanel()
  }

  const selectPreset = (nextPresetId: string): void => {
    if (!showPreset || sessionSummary?.blank !== true) return
    // Keep this as a blank-session draft. Applying the host preset RPC here
    // would try to recompose the currently attached CLI Agent; the native
    // DeepSeek AgentFactory consumes this draft when that engine is started.
    setPresetId(nextPresetId)
    setPresetOpen(false)
  }


  const toggleOpen = (): void => {
    if (locked) return
    if (open) {
      closePanel()
      return
    }
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current)
    setPanelClosing(false)
    updateAnchor()
    setEngineQuery('')
    setProviderQuery('')
    setModelQuery('')
    setOpen(true)
  }

  if (runtime === undefined) return null
  if (snapshot.catalog === null && snapshot.status === 'error') {
    return <span role="status" data-engine-suite-selector="true" className="engine-suite-selector engine-suite-selector--inline-error">Engine Suite unavailable: {snapshot.error}</span>
  }
  if (snapshot.catalog === null) {
    return <span role="status" data-engine-suite-selector="true" className="engine-suite-selector engine-suite-selector--loading">正在加载引擎…</span>
  }

  const panelStyle: CSSProperties = anchor === null ? { visibility: 'hidden' } : {
    left: Math.max(12, Math.min(anchor.right - 690, window.innerWidth - 702)),
    bottom: Math.max(12, window.innerHeight - anchor.top + 8),
  }

  return (
    <div ref={rootRef} className="engine-suite-selector" data-engine-suite-selector="true">
      <style>{`
        .engine-suite-selector, .engine-suite-selector * { box-sizing: border-box; }
        .engine-suite-selector { --engine-suite-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-static-deepseek-500, currentColor)); position: relative; display: inline-flex; align-items: center; gap: 2px; color: inherit; font-family: inherit; }
        .engine-suite-preset { position: relative; display: inline-flex; align-items: center; }
        .engine-suite-preset__trigger { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: 24px; color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 62%, transparent)); background: transparent; cursor: pointer; font: inherit; font-size: 13px; font-weight: 450; line-height: 28px; }
        .engine-suite-preset__trigger:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)); }
        .engine-suite-preset__icon { display: inline-flex; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 58%, transparent)); }
        .engine-suite-preset__value { max-width: 104px; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-preset__menu { position: absolute; z-index: 2147483001; right: 0; bottom: calc(100% + 7px); display: grid; min-width: 155px; padding: 5px; border: 1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 14%, transparent)); border-radius: 9px; background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, Canvas)); box-shadow: 0 12px 30px color-mix(in srgb, black 18%, transparent); }
        .engine-suite-preset__option { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 32px; padding: 6px 8px; border: 0; border-radius: 7px; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 12px; text-align: left; }
        .engine-suite-preset__option:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)); }
        .engine-suite-preset__option[aria-selected="true"] { color: var(--engine-suite-accent); background: color-mix(in srgb, var(--engine-suite-accent) 8%, transparent); }
        .engine-suite-preset__error { position: absolute; right: 0; bottom: calc(100% + 7px); max-width: 220px; padding: 7px 8px; border-radius: 7px; color: var(--dsw-alias-state-error-primary, #c23b55); background: var(--dsw-alias-bg-layer-3, Canvas); box-shadow: 0 8px 20px color-mix(in srgb, black 16%, transparent); font-size: 10px; }
        .engine-suite-trigger { display: inline-flex; align-items: center; gap: 5px; min-width: 196px; max-width: min(320px, 100%); min-height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: 24px; color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 62%, transparent)); background: transparent; box-shadow: none; cursor: pointer; text-align: left; transition: background 140ms ease, color 140ms ease, transform 140ms ease; font: inherit; font-size: 13px; font-weight: 450; line-height: 28px; }
        .engine-suite-trigger:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)); }
        .engine-suite-trigger:active { transform: translateY(1px); }
        .engine-suite-trigger:focus-visible, .engine-suite-option:focus-visible, .engine-suite-search:focus-visible { outline: 2px solid color-mix(in srgb, var(--engine-suite-accent) 72%, currentColor 28%); outline-offset: 2px; }
        .engine-suite-trigger__icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: 0 0 16px; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 58%, transparent)); }
        .engine-suite-trigger__copy { display: block; min-width: 0; flex: 1; line-height: 28px; }
        .engine-suite-trigger__value { display: block; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-trigger__separator { color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)); font-weight: 450; }
        .engine-suite-trigger__effort { color: var(--engine-suite-accent); font-size: 12px; font-weight: 550; }
        .engine-suite-selection-error { max-width: 220px; overflow: hidden; color: var(--dsw-alias-state-error-primary, #c23b55); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-trigger__chevron { display: inline-flex; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 52%, transparent)); transition: transform 150ms cubic-bezier(.2,.8,.2,1); }
        .engine-suite-trigger[aria-expanded="true"] .engine-suite-trigger__chevron { transform: rotate(180deg); }
        .engine-suite-popover { position: fixed; z-index: 2147483000; width: min(690px, calc(100vw - 24px)); height: 352px; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 14%, transparent)); border-radius: 13px; color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, Canvas)); box-shadow: 0 18px 55px color-mix(in srgb, black 22%, transparent), 0 2px 8px color-mix(in srgb, currentColor 10%, transparent), inset 0 1px 0 color-mix(in srgb, white 55%, transparent); backdrop-filter: blur(18px); animation: engine-suite-popover-in 150ms cubic-bezier(.2,.8,.2,1) both; }
        .engine-suite-popover[data-state="closing"] { animation: engine-suite-popover-out 150ms cubic-bezier(.4,0,1,1) both; pointer-events: none; }
        .engine-suite-columns { display: grid; grid-template-columns: minmax(140px, .95fr) minmax(150px, 1fr) minmax(165px, 1.05fr) minmax(120px, .75fr); height: 100%; min-width: 620px; overflow: hidden; }
        .engine-suite-column { display: flex; min-width: 0; min-height: 0; flex-direction: column; padding: 12px 10px; overflow: hidden; }
        .engine-suite-column + .engine-suite-column { border-left: 1px solid var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 9%, transparent)); }
        .engine-suite-column__header { display: flex; align-items: center; gap: 7px; flex: 0 0 auto; margin: 0 2px 8px; color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 60%, transparent)); font-size: 10.5px; font-weight: 650; letter-spacing: .02em; }
        .engine-suite-column__header-icon { display: inline-flex; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 58%, transparent)); }
        .engine-suite-search { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 29px; flex: 0 0 29px; margin-bottom: 7px; padding: 4px 7px; border: 1px solid transparent; border-radius: 7px; outline: 0; color: inherit; background: var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 4%, transparent)); box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 10%, transparent)); font: inherit; font-size: 10.5px; transition: background 140ms ease, box-shadow 140ms ease; }
        .engine-suite-search:focus-within { background: var(--dsw-alias-bg-layer-1, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--engine-suite-accent) 52%, transparent), 0 0 0 2px color-mix(in srgb, var(--engine-suite-accent) 10%, transparent); }
        .engine-suite-search__icon { display: inline-flex; flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)); opacity: .88; }
        .engine-suite-search__input { min-width: 0; flex: 1; border: 0; outline: 0; color: inherit; background: transparent; font: inherit; font-size: 10.5px; }
        .engine-suite-list, .engine-suite-effort-list { display: grid; align-content: start; gap: 2px; min-height: 0; flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, currentColor 26%, transparent) transparent; }
        .engine-suite-list::-webkit-scrollbar, .engine-suite-effort-list::-webkit-scrollbar { width: 3px; height: 3px; }
        .engine-suite-list::-webkit-scrollbar-track, .engine-suite-effort-list::-webkit-scrollbar-track { background: transparent; }
        .engine-suite-list::-webkit-scrollbar-thumb, .engine-suite-effort-list::-webkit-scrollbar-thumb { border-radius: 3px; background: color-mix(in srgb, currentColor 26%, transparent); }
        .engine-suite-option:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 6%, transparent)) !important; border-color: transparent !important; }
        .engine-suite-option:disabled { cursor: not-allowed; }
        .engine-suite-column--engine-locked .engine-suite-option:disabled { color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)) !important; background: var(--dsw-alias-bg-module-platform, color-mix(in srgb, currentColor 4%, transparent)) !important; border-color: transparent !important; box-shadow: none; opacity: .82; }
        .engine-suite-column--engine-locked .engine-suite-option[aria-selected="true"] { box-shadow: inset 2px 0 0 var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 22%, transparent)); }
        .engine-suite-column--engine-locked .engine-suite-option__title { color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 58%, transparent)); }
        .engine-suite-column--engine-locked .engine-suite-option__meta { color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 42%, transparent)); }
        .engine-suite-column--engine-locked .engine-suite-option__mark { border-color: var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 22%, transparent)); color: transparent; background: transparent; }
        .engine-suite-column--engine-locked .engine-suite-option[aria-selected="true"] .engine-suite-option__mark { border-color: var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 28%, transparent)); color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)); background: color-mix(in srgb, currentColor 4%, transparent); }
        .engine-suite-option[aria-selected="true"] { box-shadow: inset 2px 0 0 var(--engine-suite-accent); }
        .engine-suite-option__mark { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; flex: 0 0 15px; border: 1px solid var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 20%, transparent)); border-radius: 50%; color: transparent; }
        .engine-suite-option[aria-selected="true"] .engine-suite-option__mark { border-color: var(--engine-suite-accent); color: var(--engine-suite-accent); background: color-mix(in srgb, var(--engine-suite-accent) 12%, transparent); }
        .engine-suite-option__copy { display: grid; min-width: 0; gap: 2px; }
        .engine-suite-option__title { overflow: hidden; font-size: 10.5px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-option__meta { overflow: hidden; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 48%, transparent)); font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-effort { min-height: 32px; justify-content: space-between; }
        .engine-suite-effort__label { font-size: 10.5px; font-weight: 620; }
        .engine-suite-empty { margin: 7px 2px; color: var(--dsw-alias-label-tertiary, color-mix(in srgb, currentColor 50%, transparent)); font-size: 10px; line-height: 1.45; }
        .engine-suite-selector--loading, .engine-suite-selector--inline-error { color: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 58%, transparent)); font-size: 11px; }
        @keyframes engine-suite-popover-in { from { opacity: 0; transform: translateY(7px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes engine-suite-popover-out { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(7px) scale(.985); } }
        @media (max-width: 840px) { .engine-suite-popover { width: calc(100vw - 24px); } .engine-suite-popover > .engine-suite-columns { overflow: visible; } .engine-suite-selector { max-width: 100%; } }
        @media (max-width: 560px) { .engine-suite-trigger { min-width: 188px; } .engine-suite-trigger__value { max-width: 240px; } .engine-suite-popover { width: calc(100vw - 24px); } }
        @media (prefers-reduced-motion: reduce) { .engine-suite-trigger, .engine-suite-option, .engine-suite-popover { animation: none; transition: none; } }
      `}</style>
      {showPreset && presetOptions.length > 0 ? (
        <div className="engine-suite-preset">
          <button type="button" className="engine-suite-preset__trigger" aria-haspopup="menu" aria-expanded={presetOpen} onClick={() => setPresetOpen(value => !value)}>
            <span className="engine-suite-preset__icon"><Icon name="spark" size={15} /></span>
            <span className="engine-suite-preset__value">{presetDisplayName(presetOptions.find(option => option.id === presetId) ?? presetOptions[0]!)}</span>
            <Icon name="chevron" size={12} />
          </button>
          {presetOpen ? <div className="engine-suite-preset__menu" role="menu" aria-label="Agent 模式">
            {presetOptions.map(option => <button key={option.id} type="button" role="menuitemradio" aria-checked={option.id === presetId} className="engine-suite-preset__option" onClick={() => selectPreset(option.id)}>
              <span>{presetDisplayName(option)}</span><span>{option.id === presetId ? '✓' : ''}</span>
            </button>)}
          </div> : null}
        </div>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        className="engine-suite-trigger"
        aria-haspopup="dialog"
        aria-expanded={open && !panelClosing}
        aria-label={`选择引擎：${engineLabel}，${providerLabel}，${modelLabel}，${effortLabel}`}
        title={`${engineLabel} · ${providerLabel} · ${modelLabel} · ${effortLabel}`}
        disabled={locked}
        onClick={toggleOpen}
      >
        <span className="engine-suite-trigger__icon"><Icon name="spark" size={15} /></span>
        <span className="engine-suite-trigger__copy">
          <span className="engine-suite-trigger__value">{engineLabel} <span className="engine-suite-trigger__separator">·</span> {modelLabel} <span className="engine-suite-trigger__separator">·</span> <span className="engine-suite-trigger__effort">{effortLabel}</span></span>
        </span>
        <span className="engine-suite-trigger__chevron"><Icon name="chevron" size={14} /></span>
      </button>
      {selectionError === undefined ? null : <span role="status" className="engine-suite-selection-error">{selectionError}</span>}
      {open ? (
        <div role="dialog" aria-label="引擎与模型选择" className="engine-suite-popover" data-state={panelClosing ? 'closing' : 'open'} style={panelStyle}>
            <div className="engine-suite-columns">
              <section className={`engine-suite-column${engineLocked ? ' engine-suite-column--engine-locked' : ''}`} aria-labelledby="engine-suite-engine-label">
                <div id="engine-suite-engine-label" className="engine-suite-column__header"><span className="engine-suite-column__header-icon"><Icon name="engine" size={14} /></span>引擎</div>
                <label className="engine-suite-search" aria-label="搜索引擎"><span className="engine-suite-search__icon"><Icon name="search" size={13} /></span><input className="engine-suite-search__input" value={engineQuery} onChange={event => setEngineQuery(event.target.value)} placeholder="搜索引擎" /></label>
                <div className="engine-suite-list" role="listbox" aria-label="引擎列表">
                  {filteredEngines.length === 0 ? <p className="engine-suite-empty">没有匹配的引擎</p> : filteredEngines.map(engine => (
                    <button key={engine.id} type="button" role="option" aria-selected={engine.id === engineId} className="engine-suite-option" disabled={engineLocked || selectionBusy} style={optionStyle(engine.id === engineId)} onClick={() => chooseEngine(engine.id)}>
                      <span className="engine-suite-option__mark"><Icon name="check" size={11} /></span>
                      <span className="engine-suite-option__copy"><span className="engine-suite-option__title">{engine.displayName}</span><span className="engine-suite-option__meta">{engineMeta(engine)}</span></span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="engine-suite-column" aria-labelledby="engine-suite-provider-label">
                <div id="engine-suite-provider-label" className="engine-suite-column__header"><span className="engine-suite-column__header-icon"><Icon name="provider" size={14} /></span>服务商</div>
                <label className="engine-suite-search" aria-label="搜索服务商"><span className="engine-suite-search__icon"><Icon name="search" size={13} /></span><input className="engine-suite-search__input" value={providerQuery} onChange={event => setProviderQuery(event.target.value)} placeholder="搜索服务商" /></label>
                <div className="engine-suite-list" role="listbox" aria-label="服务商列表">
                  {filteredProviders.length === 0 ? <p className="engine-suite-empty">当前引擎暂无可用服务商</p> : filteredProviders.map(provider => (
                    <button key={provider.id} type="button" role="option" aria-selected={provider.id === providerId} className="engine-suite-option" disabled={locked || selectionBusy} style={optionStyle(provider.id === providerId)} onClick={() => chooseProvider(provider.id)}>
                      <span className="engine-suite-option__mark"><Icon name="check" size={11} /></span>
                      <span className="engine-suite-option__copy"><span className="engine-suite-option__title">{provider.name}</span><span className="engine-suite-option__meta">{providerMeta(provider)}</span></span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="engine-suite-column" aria-labelledby="engine-suite-model-label">
                <div id="engine-suite-model-label" className="engine-suite-column__header"><span className="engine-suite-column__header-icon"><Icon name="model" size={14} /></span>模型</div>
                <label className="engine-suite-search" aria-label="搜索模型"><span className="engine-suite-search__icon"><Icon name="search" size={13} /></span><input className="engine-suite-search__input" value={modelQuery} onChange={event => setModelQuery(event.target.value)} placeholder="搜索模型" /></label>
                <div className="engine-suite-list" role="listbox" aria-label="模型列表">
                  {filteredModels.length === 0 ? <p className="engine-suite-empty">当前服务商暂无可用模型</p> : filteredModels.map(model => (
                    <button key={model.id} type="button" role="option" aria-selected={model.id === modelRecordId} className="engine-suite-option" disabled={locked || selectionBusy} style={optionStyle(model.id === modelRecordId)} onClick={() => chooseModel(model.id)}>
                      <span className="engine-suite-option__mark"><Icon name="check" size={11} /></span>
                      <span className="engine-suite-option__copy"><span className="engine-suite-option__title">{displayModel(model)}</span><span className="engine-suite-option__meta">{contextLabel(model) ?? model.modelId}</span></span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="engine-suite-column" aria-labelledby="engine-suite-reasoning-label">
                <div id="engine-suite-reasoning-label" className="engine-suite-column__header"><span className="engine-suite-column__header-icon"><Icon name="reasoning" size={14} /></span>强度</div>
                <div className="engine-suite-effort-list" role="listbox" aria-label="模型强度">
                  {reasoningOptions.length === 0 ? <p className="engine-suite-empty">当前模型没有公布强度选项</p> : reasoningOptions.map(option => (
                    <button key={option.id} type="button" role="option" aria-selected={option.id === reasoningEffort} className="engine-suite-option engine-suite-effort" disabled={locked || selectionBusy} style={optionStyle(option.id === reasoningEffort)} onClick={() => { setReasoningEffort(option.id); applySelection(currentSelection({ reasoningEffort: option.id })); closePanel() }}>
                      <span className="engine-suite-effort__label">{option.id}</span><span className="engine-suite-option__mark"><Icon name="check" size={11} /></span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
        </div>
      ) : null}
    </div>
  )
}
