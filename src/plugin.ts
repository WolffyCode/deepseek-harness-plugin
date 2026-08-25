import type { Context } from '@deepseek-ai/cordis'
import { createEngineSuiteRuntime } from './engine-suite.js'
import type { EngineSuite } from './engine-suite.js'
import { EngineSuiteAgentService } from './agent/service.js'
import { registerEngineSuiteSettings } from './settings.js'
import { EngineSuiteGateway } from './remote.js'

/** Minimal Host-facing shape used by the bundle entry. Cordis Context satisfies it. */
/** One installed bundle entry; child capabilities are owned by this plugin. */
export function apply(ctx: Context): void {
  registerEngineSuiteSettings(ctx)
  const suite = createEngineSuiteRuntime()
  const agents = new EngineSuiteAgentService(ctx, suite)
  const service = Object.assign(suite, { agents }) satisfies EngineSuiteService
  ctx.provide('engineSuite', service)
  ctx.plugin(EngineSuiteGateway)
}

export interface EngineSuiteService extends EngineSuite {
  readonly agents: EngineSuiteAgentService
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    engineSuite: EngineSuiteService
    engineSuiteGateway: EngineSuiteGateway
  }
}

export type { EngineSuite }
