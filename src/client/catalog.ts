import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  EngineSuiteCatalogView,
  EngineSuiteCreateAgentRequest,
  EngineSuiteCreateAgentResponse,
  EngineSuiteSwitchAgentRequest,
  EngineSuiteSwitchAgentResponse,
  EngineSuiteDiscoverModelsResponse,
  EngineSuiteCommandsResponse,
} from '../types.js'

export interface EngineSuiteRemoteGateway {
  catalog(): Promise<RemoteResult<EngineSuiteCatalogView>>
  discoverModels(providerId: string): Promise<RemoteResult<EngineSuiteDiscoverModelsResponse>>
  createAgent(request: EngineSuiteCreateAgentRequest): Promise<RemoteResult<EngineSuiteCreateAgentResponse>>
  switchAgent(request: EngineSuiteSwitchAgentRequest): Promise<RemoteResult<EngineSuiteSwitchAgentResponse>>
  sessionCommands(sessionId: string, refresh: boolean): Promise<RemoteResult<EngineSuiteCommandsResponse>>
}

export interface EngineSuiteCatalogSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly catalog: EngineSuiteCatalogView | null
  readonly error: string | null
}

export interface EngineSuiteCatalogController {
  getSnapshot(): EngineSuiteCatalogSnapshot
  subscribe(listener: () => void): () => void
  refresh(): Promise<EngineSuiteCatalogView>
  discoverModels(providerId: string): Promise<readonly EngineSuiteDiscoverModelsResponse['models'][number][]>
  createAgent(request: EngineSuiteCreateAgentRequest): Promise<EngineSuiteCreateAgentResponse>
  switchAgent(request: EngineSuiteSwitchAgentRequest): Promise<EngineSuiteSwitchAgentResponse>
  listCommands(sessionId: string, refresh?: boolean): Promise<readonly EngineSuiteCommandsResponse['commands'][number][]>
}

function remoteError(result: { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }): Error {
  return new Error(`${result.error.code}: ${result.error.message}`)
}

export function createEngineSuiteCatalogController(
  remote: EngineSuiteRemoteGateway,
): EngineSuiteCatalogController {
  let snapshot: EngineSuiteCatalogSnapshot = { status: 'idle', catalog: null, error: null }
  const listeners = new Set<() => void>()
  let inFlight: Promise<EngineSuiteCatalogView> | undefined

  const publish = (next: EngineSuiteCatalogSnapshot): void => {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  const refresh = (): Promise<EngineSuiteCatalogView> => {
    if (inFlight !== undefined) return inFlight
    publish({ ...snapshot, status: 'loading', error: null })
    inFlight = remote.catalog().then(result => {
      if (!result.ok) throw remoteError(result)
      publish({ status: 'ready', catalog: result.value, error: null })
      return result.value
    }).catch(error => {
      publish({ ...snapshot, status: 'error', error: error instanceof Error ? error.message : String(error) })
      throw error
    }).finally(() => { inFlight = undefined })
    return inFlight
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh,
    discoverModels: async providerId => {
      const result = await remote.discoverModels(providerId)
      if (!result.ok) throw remoteError(result)
      const models = result.value.models
      const current = snapshot.catalog
      if (current !== null) {
        publish({
          status: 'ready',
          error: null,
          catalog: {
            ...current,
            models: [
              ...current.models.filter(model => model.providerId !== providerId),
              ...models,
            ],
          },
        })
      }
      return models
    },
    createAgent: async request => {
      const result = await remote.createAgent(request)
      if (!result.ok) throw remoteError(result)
      return result.value
    },
    switchAgent: async request => {
      const result = await remote.switchAgent(request)
      if (!result.ok) throw remoteError(result)
      return result.value
    },
    listCommands: async (sessionId, refresh = true) => {
      const result = await remote.sessionCommands(sessionId, refresh)
      if (!result.ok) throw remoteError(result)
      return result.value.commands
    },
  }
}
