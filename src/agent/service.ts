import type { Context } from '@deepseek-ai/cordis'
import { agentEvents, type AgentHandle, type AgentOptions } from '@deepseek-ai/dsh-agent'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import type { EngineSuiteRuntime } from '../engine-suite.js'
import type { EngineSelection } from '../profile/types.js'
import { ExternalCodexAgent } from './external-codex-agent.js'

export interface CreateCodexAgentOptions {
  readonly sessionId: string
  readonly selection: EngineSelection
  readonly apiKey: string
  readonly cwd: string
  readonly executable?: string
  readonly args?: readonly string[]
}

export interface EngineSuiteAgentHandle extends AgentHandle {
  readonly session: Session
  readonly profileId: string
}

/** Creates and registers external Codex Agents without replacing Harness core services. */
export class EngineSuiteAgentService {
  private readonly live = new Set<EngineSuiteAgentHandle>()

  constructor(
    private readonly ctx: Context,
    private readonly suite: EngineSuiteRuntime,
  ) {
    ctx.effect(() => async () => {
      const handles = [...this.live]
      this.live.clear()
      await Promise.all(handles.map(handle => handle.dispose()))
    }, 'engine-suite.agents')
  }

  async createCodex(options: CreateCodexAgentOptions): Promise<EngineSuiteAgentHandle> {
    const id = SessionId(options.sessionId)
    const profile = this.suite.resolveProfile(options.selection)
    const provider = this.suite.providers.get(profile.providerId)
    const model = this.suite.models.get(profile.modelRecordId)
    const launch = await this.suite.openCodex(options.selection, {
      apiKey: options.apiKey,
      cwd: options.cwd,
      ...options.executable === undefined ? {} : { executable: options.executable },
      ...options.args === undefined ? {} : { args: options.args },
    })
    let session: Session | undefined
    let agent: ExternalCodexAgent | undefined
    let detachSession: (() => void) | undefined
    let detachAgent: (() => void) | undefined
    try {
      session = this.ctx.sessions.prepare(id, { meta: { cwd: options.cwd } })
      const agentOptions: AgentOptions = {
        provider: provider.id,
        model: model.modelId,
      }
      agent = new ExternalCodexAgent(
        this.ctx,
        id,
        agentOptions,
        session,
        launch.runtime,
        provider.id,
        model.modelId,
      )
      detachSession = this.ctx.sessions.enter(session)
      detachAgent = this.ctx.agents.enter(agent, this.ctx.agent)
      this.ctx.sessions.announce(session)
      this.ctx.agents.announce(agent)
      agentEvents(this.ctx, agent).emit('agent/session-start', { source: 'startup' })
      const handle: EngineSuiteAgentHandle = {
        agent,
        session,
        profileId: profile.id,
        dispose: async () => {
          if (!this.live.delete(handle)) return
          await agent!.dispose()
          detachAgent?.()
          detachSession?.()
          await launch.close()
        },
      }
      this.live.add(handle)
      return handle
    } catch (error: unknown) {
      await agent?.dispose().catch(() => {})
      detachAgent?.()
      detachSession?.()
      await launch.close()
      throw error
    }
  }

  list(): readonly EngineSuiteAgentHandle[] {
    return [...this.live]
  }
}
