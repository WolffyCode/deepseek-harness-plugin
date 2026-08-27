import type { ConversationSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { AssistantChatData, ToolChatData } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { EngineSuiteSelectionRequest } from '../types.js'

/** One provider-neutral visual lifecycle for the live activity surface. */
export type EngineSuiteActivityPhase =
  | 'idle'
  | 'working'
  | 'thinking'
  | 'tool'
  | 'approval'
  | 'question'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type EngineSuiteActivityItemKind =
  | 'assistant'
  | 'reasoning'
  | 'tool-call'
  | 'tool-result'
  | 'approval'
  | 'question'
  | 'error'
  | 'cancelled'

export type EngineSuiteActivityItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface EngineSuiteActivityItem {
  readonly id: string
  readonly kind: EngineSuiteActivityItemKind
  readonly status: EngineSuiteActivityItemStatus
  readonly title: string
  readonly detail?: string
  readonly text?: string
  readonly callId?: string
  readonly seq?: number
}

export interface EngineSuiteRealtimeSnapshot {
  readonly sessionId: string
  readonly phase: EngineSuiteActivityPhase
  readonly working: boolean
  readonly stopAvailable: boolean
  readonly liveText: string
  readonly turn: number | null
  readonly step: number | null
  readonly terminal: 'completed' | 'failed' | 'cancelled' | null
  readonly selection?: EngineSuiteSelectionRequest
  readonly events: readonly EngineSuiteActivityItem[]
  readonly ariaLabel: string
}

const PHASE_LABELS: Record<EngineSuiteActivityPhase, string> = {
  idle: '',
  working: '正在工作',
  thinking: '正在思考',
  tool: '正在运行工具',
  approval: '等待批准',
  question: '等待输入',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
}

const EMPTY_EVENTS: readonly EngineSuiteActivityItem[] = []

export function activityPhaseLabel(phase: EngineSuiteActivityPhase): string {
  return PHASE_LABELS[phase]
}

/**
 * Merge a provider increment without assuming whether it is a delta or a
 * cumulative prefix. This is deliberately content based: no timer can make a
 * final response look streamed, and a replayed prefix cannot duplicate text.
 */
export function mergeIncrementalText(current: string, incoming: string): string {
  if (incoming === '') return current
  if (current === '') return incoming
  if (incoming === current || incoming.startsWith(current)) return incoming
  if (current.startsWith(incoming)) return current

  const maximumOverlap = Math.min(current.length, incoming.length)
  for (let length = maximumOverlap; length > 0; length--) {
    if (current.slice(-length) === incoming.slice(0, length)) {
      return current + incoming.slice(length)
    }
  }
  return current + incoming
}

export function mergeIncrementalChunks(chunks: readonly string[]): string {
  return chunks.reduce(mergeIncrementalText, '')
}

function safeText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function contentText(value: unknown): string {
  if (!Array.isArray(value)) return safeText(value)
  return value.map(block => {
    if (typeof block !== 'object' || block === null) return safeText(block)
    const record = block as Record<string, unknown>
    if (record['type'] === 'text' || record['type'] === 'reasoning') return typeof record['text'] === 'string' ? record['text'] : ''
    if (record['type'] === 'tool-result') return contentText(record['content'])
    if (record['type'] === 'image') return '[图片]'
    return safeText(block)
  }).filter(Boolean).join('\n')
}

function turnOfNode(node: { readonly location: { readonly kind: string; readonly turn?: unknown }; readonly data: unknown }): number | undefined {
  const data = node.data
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>
    if (typeof record['turn'] === 'number') return record['turn']
    const root = record['root']
    if (typeof root === 'object' && root !== null && typeof (root as Record<string, unknown>)['turn'] === 'number') {
      return (root as { readonly turn: number }).turn
    }
  }
  if (node.location.kind !== 'turn' && node.location.kind !== 'step') return undefined
  const turn = node.location.turn
  return typeof turn === 'object' && turn !== null && typeof (turn as Record<string, unknown>)['turn'] === 'number'
    ? (turn as { readonly turn: number }).turn
    : undefined
}

function stepOfNode(node: { readonly data: unknown }): number | undefined {
  const data = node.data
  return typeof data === 'object' && data !== null && typeof (data as Record<string, unknown>)['step'] === 'number'
    ? (data as { readonly step: number }).step
    : undefined
}

function activityItem(
  item: Omit<EngineSuiteActivityItem, 'id'> & { readonly id: string },
): EngineSuiteActivityItem {
  return item
}

function addAssistantItems(
  events: EngineSuiteActivityItem[],
  nodeKey: string,
  data: AssistantChatData,
  active: boolean,
): { readonly text: string; readonly reasoningRunning: boolean } {
  let text = ''
  let lastKind: 'text' | 'reasoning' | undefined
  let reasoningRunning = false
  data.blocks.forEach((block, index) => {
    if (block.kind === 'text') {
      text = mergeIncrementalText(text, block.text)
      lastKind = 'text'
      return
    }
    if (block.kind === 'reasoning') {
      lastKind = 'reasoning'
      reasoningRunning = data.status === 'running'
      if (active) {
        events.push(activityItem({
          id: `${nodeKey}:reasoning:${index}`,
          kind: 'reasoning',
          status: reasoningRunning ? 'running' : 'completed',
          title: '思考',
          text: block.text,
          detail: block.text,
        }))
      }
      return
    }
    if (block.kind === 'tool-call') {
      lastKind = 'text'
      if (active) {
        events.push(activityItem({
          id: `${nodeKey}:tool:${index}`,
          kind: 'tool-call',
          status: data.status === 'running' ? 'running' : 'completed',
          title: block.name || '工具调用',
          callId: block.callId,
          detail: block.argsRaw,
        }))
      }
    }
  })
  if (active && text !== '') {
    events.push(activityItem({
      id: `${nodeKey}:assistant`,
      kind: 'assistant',
      status: data.status === 'running' ? 'running' : data.status === 'interrupted' ? 'cancelled' : 'completed',
      title: '回复',
      text,
      detail: text,
    }))
  }
  // A trailing text block is not thinking even if an earlier reasoning block
  // exists. The phase reflects the provider's current tail, not history.
  reasoningRunning = reasoningRunning && lastKind === 'reasoning'
  return { text, reasoningRunning }
}

function addToolItem(events: EngineSuiteActivityItem[], nodeKey: string, root: ToolCallBlock, active: boolean): boolean {
  const settled = 'kind' in root
  const callName = settled ? root.call?.name ?? root.callId : root.name
  if (!active) return !settled
  const callDetail = settled ? root.call?.argsRaw : root.argsRaw
  events.push(activityItem({
    id: `${nodeKey}:call`,
    kind: 'tool-call',
    status: settled ? 'completed' : 'running',
    title: callName || '工具调用',
    callId: root.callId,
    ...callDetail === undefined ? {} : { detail: callDetail },
    ...settled ? { seq: root.seq } : {},
  }))
  if (settled) {
    events.push(activityItem({
      id: `${nodeKey}:result`,
      kind: 'tool-result',
      status: root.isError ? 'failed' : 'completed',
      title: root.isError ? '工具失败' : '工具结果',
      callId: root.callId,
      detail: contentText(root.content),
      seq: root.seq,
    }))
  }
  return !settled
}

function pendingDetail(item: unknown): string {
  if (typeof item !== 'object' || item === null) return safeText(item)
  const payload = (item as { readonly payload?: unknown }).payload
  if (payload === undefined) return ''
  return safeText(payload)
}

function isAbortedTurn(snapshot: ConversationSnapshot, latestTurn: number | undefined): boolean {
  if (latestTurn === undefined) return false
  const location = snapshot.chat.timeline.turns.get(latestTurn)
  const reason = location?.end?.data.reason
  return typeof reason === 'object' && reason !== null && (reason as Record<string, unknown>)['kind'] === 'aborted'
}

function latestTurnNumber(snapshot: ConversationSnapshot): number | undefined {
  return snapshot.chat.timeline.turnOrder.at(-1)
}

function activeTurnNumber(snapshot: ConversationSnapshot): number | undefined {
  for (const turn of [...snapshot.chat.timeline.turnOrder].reverse()) {
    if (snapshot.chat.timeline.turns.get(turn)?.status === 'open') return turn
  }
  return undefined
}

function terminalForSnapshot(
  snapshot: ConversationSnapshot,
  latestTurn: number | undefined,
  hasFailure: boolean,
  hasCancellation: boolean,
): 'completed' | 'failed' | 'cancelled' | null {
  if (hasFailure) return 'failed'
  if (hasCancellation) return 'cancelled'
  if (latestTurn === undefined) return null
  const end = snapshot.chat.timeline.turns.get(latestTurn)?.end
  if (end === undefined) return null
  const reason = end.data.reason
  return typeof reason === 'object' && reason !== null && (reason as Record<string, unknown>)['kind'] === 'completed'
    ? 'completed'
    : null
}

/**
 * Convert the Host's incrementally published ConversationSnapshot into the
 * single Codex-style activity language shared by Claude, Codex, and DeepSeek.
 * The snapshot is the live source; it is never rebuilt from final text.
 */
export function createEngineSuiteRealtimeSnapshot(
  snapshot: ConversationSnapshot,
  selection?: EngineSuiteSelectionRequest,
): EngineSuiteRealtimeSnapshot {
  const activeTurn = activeTurnNumber(snapshot)
  const latestTurn = activeTurn ?? latestTurnNumber(snapshot)
  const events: EngineSuiteActivityItem[] = []
  let liveText = ''
  let reasoningRunning = false
  let runningTool = false
  let hasCancellation = false
  let hasFailure = false
  let hasAssistantRunning = false
  const seenToolCalls = new Set<string>()

  for (const nodeKey of snapshot.chat.order) {
    const node = snapshot.chat.nodes.get(nodeKey)
    if (node === undefined) continue
    const nodeTurn = turnOfNode(node)
    if (latestTurn !== undefined && nodeTurn !== undefined && nodeTurn !== latestTurn) continue

    if (node.kind === 'assistant-step') {
      const data = node.data as AssistantChatData
      const active = data.status === 'running' && (snapshot.running || snapshot.composerPhase === 'engaging' || activeTurn !== undefined)
      const result = addAssistantItems(events, nodeKey, data, active)
      if (active) {
        liveText = mergeIncrementalText(liveText, result.text)
        reasoningRunning ||= result.reasoningRunning
      }
      hasAssistantRunning ||= data.status === 'running'
      if (data.status === 'interrupted') {
        hasCancellation = true
        events.push(activityItem({
          id: `${nodeKey}:cancelled`,
          kind: 'cancelled',
          status: 'cancelled',
          title: '已取消',
          detail: '回复在完成前被停止。',
        }))
      }
      continue
    }

    if (node.kind === 'tool-call') {
      const root = (node.data as ToolChatData).root
      if (root.callId !== undefined) seenToolCalls.add(root.callId)
      const active = snapshot.running || snapshot.composerPhase === 'engaging' || activeTurn !== undefined
      runningTool ||= addToolItem(events, nodeKey, root, active)
      continue
    }

    if (node.kind === 'turn-error') {
      const data = node.data as { readonly message?: string; readonly code?: string; readonly seq?: number }
      hasFailure = true
      const errorDetail = [data.message, data.code].filter(Boolean).join(' · ')
      events.push(activityItem({
        id: `${nodeKey}:error`,
        kind: 'error',
        status: 'failed',
        title: '执行失败',
        ...errorDetail === '' ? {} : { detail: errorDetail },
        ...data.seq === undefined ? {} : { seq: data.seq },
      }))
      continue
    }

    if (node.kind === 'turn-max-tokens') {
      hasFailure = true
      events.push(activityItem({
        id: `${nodeKey}:max-tokens`,
        kind: 'error',
        status: 'failed',
        title: '回复达到长度上限',
        detail: '可以发送“继续”开始新的回合。',
      }))
    }
  }

  if (snapshot.partial !== null && (activeTurn === undefined || snapshot.partial.turn === activeTurn)) {
    const hasAssistantNode = snapshot.chat.order.some(nodeKey => {
      const node = snapshot.chat.nodes.get(nodeKey)
      return node?.kind === 'assistant-step' && (node.data as AssistantChatData).turn === snapshot.partial?.turn
    })
    if (!hasAssistantNode) {
      const partialData: AssistantChatData = {
        status: 'running',
        turn: snapshot.partial.turn,
        step: snapshot.partial.step,
        blocks: snapshot.partial.blocks,
        time: 0,
      }
      const result = addAssistantItems(events, `partial:${snapshot.partial.turn}:${snapshot.partial.step}`, partialData, true)
      liveText = mergeIncrementalText(liveText, result.text)
      reasoningRunning ||= result.reasoningRunning
      hasAssistantRunning = true
    }
  }

  for (const call of snapshot.runningCalls) {
    if (seenToolCalls.has(call.callId)) continue
    runningTool = true
    events.push(activityItem({
      id: `running-call:${call.callId}`,
      kind: 'tool-call',
      status: 'running',
      title: call.name || '工具调用',
      callId: call.callId,
      detail: call.argsRaw,
      seq: call.time,
    }))
  }

  const pendingApproval = snapshot.pending.find(item => item.kind === 'approval')
  const pendingQuestion = snapshot.pending.find(item => item.kind === 'question')
  if (pendingApproval !== undefined) {
    events.push(activityItem({
      id: pendingApproval.key,
      kind: 'approval',
      status: 'pending',
      title: '需要批准工具调用',
      detail: pendingDetail(pendingApproval),
    }))
  }
  if (pendingQuestion !== undefined) {
    events.push(activityItem({
      id: pendingQuestion.key,
      kind: 'question',
      status: 'pending',
      title: '等待你的输入',
      detail: pendingDetail(pendingQuestion),
    }))
  }

  if (snapshot.promptError !== null) {
    hasFailure = true
    events.push(activityItem({
      id: `prompt-error:${snapshot.promptError.op}:${snapshot.promptError.error.code}`,
      kind: 'error',
      status: 'failed',
      title: snapshot.promptError.op === 'stop' ? '停止失败' : '发送失败',
      detail: `${snapshot.promptError.error.message} · ${snapshot.promptError.error.code}`,
    }))
  }
  if (snapshot.lastAgentError !== null) {
    hasFailure = true
    events.push(activityItem({
      id: 'agent-error',
      kind: 'error',
      status: 'failed',
      title: '引擎错误',
      detail: snapshot.lastAgentError,
    }))
  }

  hasCancellation ||= isAbortedTurn(snapshot, latestTurn)
  const hasActiveWork = snapshot.running
    || snapshot.composerPhase === 'engaging'
    || pendingApproval !== undefined
    || pendingQuestion !== undefined
    || runningTool
    || hasAssistantRunning

  const phase: EngineSuiteActivityPhase = hasActiveWork
    ? pendingQuestion !== undefined
      ? 'question'
      : pendingApproval !== undefined
        ? 'approval'
        : runningTool
          ? 'tool'
          : reasoningRunning
            ? 'thinking'
            : 'working'
    : hasFailure
      ? 'failed'
      : hasCancellation
        ? 'cancelled'
        : terminalForSnapshot(snapshot, latestTurn, hasFailure, hasCancellation) === 'completed'
          ? 'completed'
          : 'idle'

  const terminal = terminalForSnapshot(snapshot, latestTurn, hasFailure, hasCancellation)
  const seenLiveToolCalls = new Set<string>()
  const deduplicatedEvents = events.filter(item => {
    if (item.kind !== 'tool-call' || item.callId === undefined) return true
    if (seenLiveToolCalls.has(item.callId)) return false
    seenLiveToolCalls.add(item.callId)
    return true
  })
  const visibleEvents = hasActiveWork || phase === 'failed' || phase === 'cancelled' ? deduplicatedEvents : EMPTY_EVENTS
  const step = activeTurn === undefined
    ? undefined
    : snapshot.chat.timeline.turns.get(activeTurn)?.steps.at(-1)?.step
  return {
    sessionId: String(snapshot.sessionId),
    phase,
    working: hasActiveWork,
    stopAvailable: hasActiveWork,
    liveText,
    turn: activeTurn ?? null,
    step: step ?? null,
    terminal,
    ...(selection === undefined ? {} : { selection }),
    events: visibleEvents,
    ariaLabel: PHASE_LABELS[phase] === '' ? '引擎空闲' : `${PHASE_LABELS[phase]}${hasActiveWork ? '，可以停止' : ''}`,
  }
}

export interface EngineSuiteActivityStore {
  getSnapshot(sessionId: string): EngineSuiteRealtimeSnapshot | undefined
  subscribe(sessionId: string, listener: () => void): () => void
  publish(sessionId: string, snapshot: EngineSuiteRealtimeSnapshot): void
  clear(sessionId?: string): void
}

/** Client-owned mirror for activity that survives a slot render boundary. */
export function createEngineSuiteActivityStore(): EngineSuiteActivityStore {
  const snapshots = new Map<string, EngineSuiteRealtimeSnapshot>()
  const listeners = new Map<string, Set<() => void>>()
  const publish = (sessionId: string, snapshot: EngineSuiteRealtimeSnapshot): void => {
    const previous = snapshots.get(sessionId)
    if (previous === snapshot) return
    snapshots.set(sessionId, snapshot)
    for (const listener of [...listeners.get(sessionId) ?? []]) listener()
  }
  return {
    getSnapshot: sessionId => snapshots.get(sessionId),
    subscribe: (sessionId, listener) => {
      const bucket = listeners.get(sessionId) ?? new Set<() => void>()
      bucket.add(listener)
      listeners.set(sessionId, bucket)
      return () => {
        bucket.delete(listener)
        if (bucket.size === 0) listeners.delete(sessionId)
      }
    },
    publish,
    clear: sessionId => {
      if (sessionId !== undefined) {
        snapshots.delete(sessionId)
        listeners.delete(sessionId)
        return
      }
      snapshots.clear()
      listeners.clear()
    },
  }
}

export interface EngineSuiteActivityAriaAttributes {
  readonly role: 'status'
  readonly ariaLive: 'polite'
  readonly dataState: EngineSuiteActivityPhase
}

export function activityAriaAttributes(phase: EngineSuiteActivityPhase): EngineSuiteActivityAriaAttributes {
  return { role: 'status', ariaLive: 'polite', dataState: phase }
}

export function activityDetail(value: unknown): string {
  return contentText(value)
}

export function activityStep(snapshot: ConversationSnapshot): number | undefined {
  const turn = activeTurnNumber(snapshot)
  return turn === undefined ? undefined : snapshot.chat.timeline.turns.get(turn)?.steps.at(-1)?.step
}

export function activityNodeStep(node: { readonly data: unknown }): number | undefined {
  return stepOfNode(node)
}
