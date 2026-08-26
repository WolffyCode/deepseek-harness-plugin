import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineSuiteCommandView, EngineSuiteSelectionRequest } from '../types.js'
import { getEngineSuiteComposerRuntime, getEngineSuiteSessionSelection } from './composer-runtime.js'

interface InputTriggerCandidate {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly argumentHint?: string
  readonly source?: 'command' | 'skill'
}
interface ClientSessionContext { readonly sessionId: string }
interface SubmitEnvelope { readonly images: number }
interface InputTriggerPick { readonly candidate: InputTriggerCandidate; readonly session: ClientSessionContext }
interface InputTriggerSource {
  readonly trigger: '/'
  readonly name: string
  readonly order?: number
  readonly showGroupTitle?: boolean
  candidates(session: ClientSessionContext, request: { readonly query: string; readonly signal: AbortSignal }): Promise<readonly InputTriggerCandidate[]>
  onPick(pick: InputTriggerPick): unknown
  matchEnter?(session: ClientSessionContext, line: string, signal: AbortSignal, envelope: SubmitEnvelope): Promise<unknown>
  warm?(session: ClientSessionContext): void
}
interface InputTriggersFace { registerSource(source: InputTriggerSource): () => void }
interface SessionsFace {
  binding(sessionId: string): { session: { prompt(content: [{ type: 'text'; text: string }], mode: 'queue'): Promise<{ ok: boolean; error?: { message: string } }> } } | undefined
}

/** These commands belong to Harness itself and must not be sent to a local CLI. */
const HARNESS_COMMANDS = new Set(['permission', 'export', 'feedback', 'goal'])

function cliSelection(sessionId: string): EngineSuiteSelectionRequest | undefined { return getEngineSuiteSessionSelection(sessionId) }
function isCliSelection(selection: EngineSuiteSelectionRequest | undefined): boolean {
  return selection?.engineId === 'claude-cli' || selection?.engineId === 'codex-cli'
}

function commandName(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return undefined
  const name = trimmed.slice(1).split(/\s/u, 1)[0]?.toLocaleLowerCase()
  return name === undefined || name.length === 0 ? undefined : name
}

async function sessionCommands(sessionId: string): Promise<readonly EngineSuiteCommandView[]> {
  const runtime = getEngineSuiteComposerRuntime()
  if (runtime === undefined) return []
  return runtime.catalog.listCommands(sessionId, true)
}

function claim(sessionId: string, line: string, sessions: SessionsFace): unknown {
  return {
    claim: {
      token: line,
      submit: async (_args: string, _actx: ClientContext, images: readonly unknown[]) => {
        if (images.length > 0) return { kind: 'error', text: 'CLI Slash Command 暂不支持图片附件' }
        const session = sessions.binding(sessionId)?.session
        if (session === undefined) return { kind: 'error', text: '当前 CLI Session 不可用' }
        const result = await session.prompt([{ type: 'text', text: line }], 'queue')
        return result.ok ? { kind: 'success' } : { kind: 'error', text: result.error?.message ?? 'CLI Slash Command 发送失败' }
      },
    },
  }
}

/** CLI-owned slash source; the host command source remains authoritative for native sessions. */
export function createCliSlashSource(ctx: ClientContext): InputTriggerSource {
  const inputTriggers = ctx.get('inputTriggers') as unknown as InputTriggersFace
  const sessions = ctx.get('sessions') as unknown as SessionsFace
  void inputTriggers
  return {
    trigger: '/',
    name: 'engine-suite-cli',
    order: -100,
    showGroupTitle: false,
    candidates: async (session, request) => {
      if (!isCliSelection(cliSelection(session.sessionId))) return []
      let commands: readonly EngineSuiteCommandView[]
      try {
        commands = await sessionCommands(session.sessionId)
      } catch {
        return []
      }
      const query = request.query.toLocaleLowerCase()
      return commands
        .filter(command => !HARNESS_COMMANDS.has(command.name.toLocaleLowerCase()))
        .filter(command => command.name.toLocaleLowerCase().startsWith(query))
        .map(command => ({
          id: `engine-suite-cli/${command.name}`,
          label: command.name,
          detail: command.description,
          argumentHint: command.argumentHint,
          source: command.source,
        }))
    },
    onPick: pick => {
      if (!isCliSelection(cliSelection(pick.session.sessionId))) return undefined
      const prefix = 'engine-suite-cli/'
      const name = pick.candidate.id.startsWith(prefix) ? pick.candidate.id.slice(prefix.length) : ''
      return claim(pick.session.sessionId, `/${name}`, sessions)
    },
    matchEnter: async (session, line) => {
      if (!isCliSelection(cliSelection(session.sessionId))) return undefined
      const name = commandName(line)
      if (name === undefined || HARNESS_COMMANDS.has(name)) return undefined
      return claim(session.sessionId, line, sessions)
    },
    warm: () => undefined,
  }
}

export function mountCliSlashSource(ctx: ClientContext): () => void {
  const inputTriggers = ctx.get('inputTriggers') as unknown as InputTriggersFace
  return inputTriggers.registerSource(createCliSlashSource(ctx))
}
