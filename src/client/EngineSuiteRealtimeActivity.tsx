import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useMemo, type ReactElement } from 'react'
import { getEngineSuiteSessionSelection } from './composer-runtime.js'
import {
  activityAriaAttributes,
  activityPhaseLabel,
  createEngineSuiteRealtimeSnapshot,
  type EngineSuiteActivityItem,
  type EngineSuiteActivityStore,
} from './realtime-ui.js'

export interface EngineSuiteRealtimeActivityInjected {
  readonly activityStore: EngineSuiteActivityStore
  readonly stop: () => Promise<void>
}

export type EngineSuiteRealtimeActivityProps = PropsRuntime<'conversation.input.dock'> & EngineSuiteRealtimeActivityInjected

function routeLabel(selection: ReturnType<typeof getEngineSuiteSessionSelection>): string | undefined {
  if (selection === undefined) return undefined
  return [selection.engineId, selection.providerId, selection.modelRecordId, selection.reasoningEffort]
    .filter(Boolean)
    .join(' · ')
}

function detailFor(item: EngineSuiteActivityItem): string | undefined {
  if (item.detail === undefined || item.detail === '') return undefined
  return item.detail
}

function ActivityItem({ item }: { readonly item: EngineSuiteActivityItem }): ReactElement {
  const detail = detailFor(item)
  const expandable = detail !== undefined
  const statusLabel = item.status === 'running'
    ? '进行中'
    : item.status === 'pending'
      ? '等待处理'
      : item.status === 'failed'
        ? '失败'
        : item.status === 'cancelled'
          ? '已取消'
          : '已完成'
  return (
    <details className="engine-suite-realtime__item" data-kind={item.kind} data-status={item.status} open={item.status === 'running' || item.status === 'pending'}>
      <summary className="engine-suite-realtime__summary" aria-label={`${item.title}：${statusLabel}`}>
        <span className="engine-suite-realtime__marker" aria-hidden="true" />
        <span className="engine-suite-realtime__item-title">{item.title}</span>
        <span className="engine-suite-realtime__item-status">{statusLabel}</span>
      </summary>
      {expandable ? <pre className="engine-suite-realtime__detail">{detail}</pre> : null}
    </details>
  )
}

export function EngineSuiteRealtimeActivity({ session, activityStore, stop }: EngineSuiteRealtimeActivityProps): ReactElement | null {
  const selection = getEngineSuiteSessionSelection(String(session.sessionId))
  const activity = useMemo(() => createEngineSuiteRealtimeSnapshot(session, selection), [selection, session])
  useEffect(() => {
    activityStore.publish(activity.sessionId, activity)
  }, [activity, activityStore])

  if (!activity.working && activity.phase !== 'failed' && activity.phase !== 'cancelled') return null

  const route = routeLabel(activity.selection)
  const aria = activityAriaAttributes(activity.phase)
  return (
    <section
      className="engine-suite-realtime"
      data-engine-suite-realtime="true"
      data-state={aria.dataState}
      data-working={activity.working || undefined}
      role={aria.role}
      aria-live={aria.ariaLive}
      aria-label={activity.ariaLabel}
    >
      <style>{`
        .engine-suite-realtime { --engine-suite-realtime-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4d8dff); width: min(100%, 760px); margin: 0 auto 8px; padding: 9px 12px; border: 1px solid color-mix(in srgb, var(--engine-suite-realtime-accent) 20%, transparent); border-radius: 13px; color: inherit; background: color-mix(in srgb, var(--engine-suite-realtime-accent) 4%, transparent); }
        .engine-suite-realtime__header { display: flex; align-items: center; gap: 8px; min-height: 24px; }
        .engine-suite-realtime__pulse { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 999px; background: var(--engine-suite-realtime-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--engine-suite-realtime-accent) 12%, transparent); }
        [data-working="true"] .engine-suite-realtime__pulse { animation: engine-suite-realtime-pulse 1.3s ease-in-out infinite; }
        .engine-suite-realtime__title { font-size: 13px; font-weight: 650; }
        .engine-suite-realtime__route { min-width: 0; overflow: hidden; color: color-mix(in srgb, currentColor 58%, transparent); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-realtime__stop { margin-left: auto; min-height: 28px; padding: 3px 10px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 12px; }
        .engine-suite-realtime__stop:hover { border-color: var(--engine-suite-realtime-accent); background: color-mix(in srgb, var(--engine-suite-realtime-accent) 9%, transparent); }
        .engine-suite-realtime__stop:focus-visible, .engine-suite-realtime__summary:focus-visible { outline: 2px solid var(--engine-suite-realtime-accent); outline-offset: 2px; }
        .engine-suite-realtime__events { display: grid; gap: 3px; margin-top: 7px; }
        .engine-suite-realtime__item { border-top: 1px solid color-mix(in srgb, currentColor 9%, transparent); }
        .engine-suite-realtime__summary { display: flex; align-items: center; gap: 7px; min-height: 28px; cursor: pointer; list-style: none; font-size: 12px; }
        .engine-suite-realtime__summary::-webkit-details-marker { display: none; }
        .engine-suite-realtime__marker { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 999px; background: color-mix(in srgb, currentColor 40%, transparent); }
        [data-status="running"] .engine-suite-realtime__marker { background: var(--engine-suite-realtime-accent); }
        [data-status="failed"] .engine-suite-realtime__marker, [data-status="cancelled"] .engine-suite-realtime__marker { background: #d45b65; }
        .engine-suite-realtime__item-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .engine-suite-realtime__item-status { margin-left: auto; color: color-mix(in srgb, currentColor 54%, transparent); font-size: 11px; }
        .engine-suite-realtime__detail { max-height: 180px; margin: 0 0 7px 13px; overflow: auto; color: color-mix(in srgb, currentColor 74%, transparent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
        .engine-suite-realtime__live { margin: 7px 0 0 13px; color: color-mix(in srgb, currentColor 78%, transparent); font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
        @keyframes engine-suite-realtime-pulse { 0%, 100% { opacity: .46; transform: scale(.9); } 50% { opacity: 1; transform: scale(1); } }
        @media (max-width: 560px) { .engine-suite-realtime { width: 100%; padding: 8px 10px; border-radius: 11px; } .engine-suite-realtime__route { display: none; } .engine-suite-realtime__stop { padding-inline: 8px; } }
        @media (prefers-reduced-motion: reduce) { .engine-suite-realtime__pulse { animation: none; } }
      `}</style>
      <div className="engine-suite-realtime__header">
        <span className="engine-suite-realtime__pulse" aria-hidden="true" />
        <span className="engine-suite-realtime__title">{activityPhaseLabel(activity.phase)}</span>
        {route === undefined ? null : <span className="engine-suite-realtime__route" title={route}>{route}</span>}
        {activity.stopAvailable ? <button type="button" className="engine-suite-realtime__stop" aria-label="停止当前运行" onClick={() => { void stop() }}>停止</button> : null}
      </div>
      {activity.working && activity.events.length === 0 ? <div className="engine-suite-realtime__live">等待引擎返回首个事件…</div> : null}
      {activity.liveText !== '' && activity.working ? <div className="engine-suite-realtime__live" data-live-assistant-text="true">{activity.liveText}</div> : null}
      {activity.events.length > 0 ? <div className="engine-suite-realtime__events" data-timeline="true">{activity.events.map(item => <ActivityItem key={item.id} item={item} />)}</div> : null}
    </section>
  )
}
