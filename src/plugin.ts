import { createEngineSuite, type EngineSuite } from './index.js'

/** Minimal Host-facing shape used by the bundle entry. Cordis Context satisfies it. */
export interface EngineSuitePluginContext {
  provide(name: string, value: unknown): void
}

/** One installed bundle entry; child capabilities are owned by this plugin. */
export function apply(ctx: EngineSuitePluginContext): void {
  ctx.provide('engineSuite', createEngineSuite())
}

export type { EngineSuite }
