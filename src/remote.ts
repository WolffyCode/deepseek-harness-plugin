import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import type { EngineSuiteService } from './plugin.js'
import type { EngineSelection } from './profile/types.js'

export interface EngineSuiteCatalogView {
  readonly engines: readonly unknown[]
  readonly providers: readonly unknown[]
  readonly models: readonly unknown[]
}

export interface EngineSuiteCreateAgentRequest {
  readonly sessionId: string
  readonly selection: EngineSelection
  readonly cwd: string
}

export interface EngineSuiteCreateAgentResponse {
  readonly sessionId: string
  readonly agentId: string
  readonly profileId: string
}

/** Host remote surface used by the client selector and settings UI. */
export class EngineSuiteGateway extends TypertRemoteService {
  static inject = ['engineSuite']

  declare readonly engineSuite: EngineSuiteService

  constructor(ctx: Context) {
    super(ctx, 'engineSuiteGateway')
    this.engineSuite = ctx.get('engineSuite') as EngineSuiteService
  }

  @Remote('catalog')
  catalog(): EngineSuiteCatalogView {
    return {
      engines: this.engineSuite.engines.list(),
      providers: this.engineSuite.providers.list(),
      models: this.engineSuite.models.list(),
    }
  }

  @Remote('createAgent')
  async createAgent(request: EngineSuiteCreateAgentRequest): Promise<EngineSuiteCreateAgentResponse> {
    const profile = this.engineSuite.resolveProfile(request.selection)
    const provider = this.engineSuite.providers.get(profile.providerId)
    const apiKey = this.resolveApiKey(provider.credentialRef)
    const handle = await this.engineSuite.agents.createCodex({
      sessionId: request.sessionId,
      selection: request.selection,
      apiKey,
      cwd: request.cwd,
    })
    return {
      sessionId: String(handle.session.id),
      agentId: String(handle.agent.id),
      profileId: handle.profileId,
    }
  }

  @Remote('cancelAgent')
  async cancelAgent(agentId: string): Promise<void> {
    const handle = this.engineSuite.agents.list().find(candidate => String(candidate.agent.id) === agentId)
    if (handle === undefined) throw new Error(`unknown engine-suite agent: ${agentId}`)
    handle.agent.cancel({ kind: 'user' })
  }

  private resolveApiKey(credentialRef: string): string {
    const envKey = process.env[credentialRef]
      ?? (credentialRef === 'debug-sub2api-codex' ? process.env['DSH_DEBUG_CODEX_API_KEY'] : undefined)
      ?? process.env['OPENAI_API_KEY']
    if (envKey === undefined || envKey.trim() === '') {
      throw new Error(`credential is not available for provider reference: ${credentialRef}`)
    }
    return envKey
  }
}
