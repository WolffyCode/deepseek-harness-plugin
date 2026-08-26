import { normalizeBaseUri } from '../provider/types.js'
import type { EngineMcpSet } from '../assets.js'

export interface CodexProviderRuntimeConfig {
  readonly providerName: string
  readonly baseUri: string
  readonly model: string
  readonly apiKey: string
  readonly mcpSet?: EngineMcpSet
}

export interface CodexConfigMaterialization {
  readonly configToml: string
  readonly modelProvider: string
  readonly environment: Readonly<Record<string, string>>
  readonly redactions: readonly string[]
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${label} must not be empty`)
  return normalized
}

function providerKey(value: string): string {
  const normalized = nonEmpty(value, 'provider name').replace(/[^A-Za-z0-9_-]/g, '_')
  return normalized.length > 0 ? normalized : 'dsh_provider'
}

/** Render the minimal Codex provider config without embedding an API key. */

export interface CodexProviderConfigMaterialization {
  readonly configToml: string
  readonly modelProvider: string
  readonly environment: Readonly<Record<string, string>>
  readonly redactions: readonly string[]
}

function renderMcpServers(mcpSet: EngineMcpSet | undefined): string[] {
  if (mcpSet === undefined) return []
  const lines: string[] = []
  for (const server of mcpSet.servers) {
    const key = server.id.replace(/[^A-Za-z0-9_-]/g, '_') || 'mcp_server'
    lines.push(`[mcp_servers.${key}]`)
    if (server.transport === 'stdio') {
      if (server.command === undefined) throw new Error(`stdio MCP server ${server.id} requires a command`)
      lines.push(`command = ${tomlString(server.command)}`)
      if (server.args !== undefined) lines.push(`args = ${JSON.stringify([...server.args])}`)
    } else {
      lines.push(`url = ${tomlString(server.url ?? '')}`)
    }
    if (server.transport === 'stdio' && server.environment !== undefined) {
      lines.push(`env = ${JSON.stringify(server.environment)}`)
    }
    lines.push('')
  }
  return lines
}

export function renderCodexProviderConfig(input: {
  readonly providerName: string
  readonly baseUri: string
  readonly apiKey: string
  readonly mcpSet?: EngineMcpSet
}): CodexProviderConfigMaterialization {
  const providerName = nonEmpty(input.providerName, 'provider name')
  const baseUri = normalizeBaseUri(input.baseUri)
  const apiKey = nonEmpty(input.apiKey, 'API key')
  const providerKeyName = providerKey(providerName)
  return {
    configToml: [
      `model_provider = ${tomlString(providerKeyName)}`,
      '',
      `[model_providers.${providerKeyName}]`,
      `name = ${tomlString(providerName)}`,
      `base_url = ${tomlString(baseUri)}`,
      'wire_api = "responses"',
      'env_key = "OPENAI_API_KEY"',
      'requires_openai_auth = true',
      '',
      '[shell_environment_policy]',
      'inherit = "none"',
      '',
      ...renderMcpServers(input.mcpSet),
    ].join('\n'),
    modelProvider: providerKeyName,
    environment: { OPENAI_API_KEY: apiKey },
    redactions: [apiKey],
  }
}

export function renderCodexConfig(input: CodexProviderRuntimeConfig): CodexConfigMaterialization {
  const providerName = nonEmpty(input.providerName, 'provider name')
  const baseUri = normalizeBaseUri(input.baseUri)
  const model = nonEmpty(input.model, 'model')
  const apiKey = nonEmpty(input.apiKey, 'API key')
  const providerKeyName = providerKey(providerName)
  const configToml = [
    `model_provider = ${tomlString(providerKeyName)}`,
    `model = ${tomlString(model)}`,
    '',
    `[model_providers.${providerKeyName}]`,
    `name = ${tomlString(providerName)}`,
    `base_url = ${tomlString(baseUri)}`,
    'wire_api = "responses"',
    'env_key = "OPENAI_API_KEY"',
    'requires_openai_auth = true',
    '',
    '[shell_environment_policy]',
    'inherit = "none"',
    '',
    ...renderMcpServers(input.mcpSet),
  ].join('\n')
  return {
    configToml,
    modelProvider: providerKeyName,
    environment: { OPENAI_API_KEY: apiKey },
    redactions: [apiKey],
  }
}
