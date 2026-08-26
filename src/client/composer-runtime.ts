import type { EngineSuiteCatalogController } from './catalog.js'
import type { EngineSuiteSelectionRequest, EngineSuiteSwitchAgentRequest } from '../types.js'

export interface EngineSuiteComposerRuntime {
  readonly catalog: EngineSuiteCatalogController
  readonly createAgent: (request: import('../types.js').EngineSuiteCreateAgentRequest) => Promise<void>
  readonly openSession: (sessionId: string) => Promise<void>
  readonly switchAgent: (request: EngineSuiteSwitchAgentRequest) => Promise<void>
  readonly setSessionSelection: (sessionId: string, selection: EngineSuiteSelectionRequest) => void
}

let runtime: EngineSuiteComposerRuntime | undefined
const selections = new Map<string, EngineSuiteSelectionRequest>()

export function setEngineSuiteComposerRuntime(next: EngineSuiteComposerRuntime | undefined): void {
  runtime = next
  if (next === undefined) selections.clear()
}

export function getEngineSuiteComposerRuntime(): EngineSuiteComposerRuntime | undefined {
  return runtime
}

export function setEngineSuiteSessionSelection(sessionId: string, selection: EngineSuiteSelectionRequest): void {
  selections.set(sessionId, selection)
}

export function getEngineSuiteSessionSelection(sessionId: string): EngineSuiteSelectionRequest | undefined {
  return selections.get(sessionId)
}
