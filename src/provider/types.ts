import type { EngineId } from '../engine/types.js'

export type ProviderId = string
export type CredentialRef = string
export type ProviderStatus = 'unknown' | 'testing' | 'available' | 'rejected' | 'failed'
export type ProviderWireApi = 'responses'
export type ProviderAuthMode = 'api-key'

export interface EngineProvider {
  readonly id: ProviderId
  readonly engineId: EngineId
  readonly name: string
  readonly baseUri: string
  readonly credentialRef: CredentialRef
  readonly wireApi: ProviderWireApi
  readonly authMode: ProviderAuthMode
  readonly enabled: boolean
  readonly status: ProviderStatus
  readonly lastTestedAt?: number
  readonly lastError?: string
}

export interface CreateProviderInput {
  readonly id: ProviderId
  readonly engineId: EngineId
  readonly name: string
  readonly baseUri: string
  readonly credentialRef: CredentialRef
  readonly wireApi?: ProviderWireApi
  readonly authMode?: ProviderAuthMode
}

export function normalizeBaseUri(baseUri: string): string {
  const value = baseUri.trim()
  if (value.length === 0) throw new Error('provider base URI must not be empty')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`provider base URI is invalid: ${value}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('provider base URI must use http or https')
  }
  return url.toString().replace(/\/$/, '')
}

export function createProvider(input: CreateProviderInput): EngineProvider {
  const id = input.id.trim()
  const name = input.name.trim()
  const credentialRef = input.credentialRef.trim()
  if (id.length === 0) throw new Error('provider id must not be empty')
  if (name.length === 0) throw new Error('provider name must not be empty')
  if (credentialRef.length === 0) throw new Error('provider credential reference must not be empty')
  if (input.wireApi !== undefined && input.wireApi !== 'responses') {
    throw new Error('Codex v1 supports only the Responses API wire protocol')
  }
  if (input.authMode !== undefined && input.authMode !== 'api-key') {
    throw new Error('Codex v1 supports only API-key authentication')
  }
  return {
    id,
    engineId: input.engineId,
    name,
    baseUri: normalizeBaseUri(input.baseUri),
    credentialRef,
    wireApi: 'responses',
    authMode: 'api-key',
    enabled: true,
    status: 'unknown',
  }
}
