import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle, GenerateOptions, LlmModelInfo, LlmReasoningEffortInfo, LlmResolvedModelInfo, LlmRuntime, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { EngineSuiteRuntime } from './engine-suite.js'

/**
 * Advertises externally-driven local Engine routes to Harness's API route guard.
 * Actual generation never enters this adapter: ExternalEngineAgent owns the
 * local app-server process and projects its output into the Session log.
 */
class ExternalEngineRouteAdapter extends LlmAdapter {
  constructor(private readonly suite: EngineSuiteRuntime) { super() }

  override providerInfo(provider: string) {
    return { id: provider, name: this.suite.providers.get(provider).name }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.suite.models.list(provider).map(model => ({
      provider,
      id: model.modelId,
      name: model.displayName ?? model.modelId,
      ...model.description === undefined ? {} : { description: model.description },
    })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const record = this.suite.models.list(provider).find(candidate => candidate.modelId === model)
    const reasoning = record === undefined || record.reasoningOptions.length === 0
      ? undefined
      : {
        efforts: record.reasoningOptions.map(option => ({
          id: option.id as LlmReasoningEffortInfo['id'],
          name: option.id,
          ...option.description === undefined ? {} : { description: option.description },
        })),
        ...record.defaultReasoningEffort === undefined ? {} : { defaultEffort: record.defaultReasoningEffort as LlmReasoningEffortInfo['id'] },
      }
    return Promise.resolve({
      provider,
      id: model,
      name: record?.displayName ?? model,
      ...record?.description === undefined ? {} : { description: record.description },
      ...reasoning === undefined ? {} : { reasoning },
    })
  }

  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('External Engine routes are driven by the Engine Suite app-server Agent, not Harness LLM stream')
  }
}

/** Keep the LLM provider registry aware of active external Engine routes. */
export class ExternalEngineLlmRouteRegistration {
  private registration: AdapterRegistrationHandle | undefined
  private readonly adapter: LlmAdapter

  constructor(
    private readonly llm: LlmRuntime,
    private readonly suite: EngineSuiteRuntime,
  ) {
    this.adapter = new ExternalEngineRouteAdapter(suite)
  }

  sync(): void {
    const providers = this.suite.providers.list()
      .filter(provider => provider.enabled)
      .map(provider => provider.id)
    if (this.registration === undefined) {
      if (providers.length === 0) return
      this.registration = this.llm.registerAdapter(providers, this.adapter)
      return
    }
    this.registration.replace(providers)
  }

  dispose(): void {
    this.registration?.()
    this.registration = undefined
  }
}
