import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'

export interface EngineSuiteAgentPresetOption {
  readonly id: string
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

export interface EngineSuiteAgentPresetFace {
  list(): Promise<readonly EngineSuiteAgentPresetOption[]>
  select(sessionId: string, agentPreset: string): Promise<string>
}

export function createEngineSuiteAgentPresetFace(
  connection: ConnectionHandle,
): EngineSuiteAgentPresetFace {
  return {
    async list(): Promise<readonly EngineSuiteAgentPresetOption[]> {
      const response = await connection.api.agentPresets.list({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      return response.result.value.presets.filter((preset: EngineSuiteAgentPresetOption) => preset.broken === undefined)
    },
    async select(sessionId: string, agentPreset: string): Promise<string> {
      const response = await connection.api.agentPresets.select({ sessionId: sessionId as never, agentPreset })
      if (!response.result.ok) throw new Error(response.result.error.message)
      return response.result.value.agentPreset
    },
  }
}

export function presetDisplayName(preset: EngineSuiteAgentPresetOption): string {
  if (preset.name !== undefined && preset.name.trim() !== '') return preset.name
  if (preset.id === 'standard') return '标准模式'
  if (preset.id === 'code') return 'PTC 模式'
  if (preset.id === 'minimal') return '极简模式'
  if (preset.id === 'cordis') return '创造模式'
  return preset.id
}
