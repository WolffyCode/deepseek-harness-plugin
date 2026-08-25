import { normalizeBaseUri } from '../provider/types.js'

export interface CodexProviderRuntimeConfig {
  readonly providerName: string
  readonly baseUri: string
  readonly model: string
  readonly apiKey: string
}

export interface CodexConfigMaterialization {
  readonly configToml: string
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
    'requires_openai_auth = true',
    '',
  ].join('\n')
  return {
    configToml,
    environment: { OPENAI_API_KEY: apiKey },
    redactions: [apiKey],
  }
}
