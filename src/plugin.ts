import type { Context } from '@deepseek-ai/cordis'
import { createEngineSuite, type EngineSuite } from './index.js'
import { EngineSuiteAgentService } from './agent/service.js'
import { registerEngineSuiteSettings } from './settings.js'

/** Minimal Host-facing shape used by the bundle entry. Cordis Context satisfies it. */
/** One installed bundle entry; child capabilities are owned by this plugin. */
export function apply(ctx: Context): void {
  registerEngineSuiteSettings(ctx)
  const suite = createEngineSuite()
  const agents = new EngineSuiteAgentService(ctx, suite)
  ctx.provide('engineSuite', Object.assign(suite, { agents }) satisfies EngineSuiteService)
}

export interface EngineSuiteService extends EngineSuite {
  readonly agents: EngineSuiteAgentService
}

export type { EngineSuite }
