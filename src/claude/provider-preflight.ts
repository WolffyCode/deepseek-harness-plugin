const DEFAULT_TIMEOUT_MS = 10_000
const MAX_DIAGNOSTIC_BODY_LENGTH = 512
const ANTHROPIC_VERSION = '2023-06-01'

export type ClaudeProviderPreflightFailureKind =
  | 'endpoint-mismatch'
  | 'auth'
  | 'network'
  | 'protocol'

export interface ClaudeProviderPreflightOptions {
  readonly baseUri: string
  readonly authToken: string
  readonly model: string
  readonly timeoutMs?: number
}

export type ClaudeProviderPreflightResult =
  | {
      readonly ok: true
      readonly modelsStatus: number
      readonly messagesStatus: number
    }
  | {
      readonly ok: false
      readonly kind: ClaudeProviderPreflightFailureKind
      readonly message: string
    }

/** Rejects every real Claude verification model that is not a GLM model or names Opus. */
export function assertClaudeRealModelAllowed(model: string): void {
  const normalized = model.trim()
  if (/opus/i.test(normalized)) throw new Error(`Claude real verification rejects Opus model: ${normalized}`)
  if (!/^glm(?:[-_.:/]|$)/iu.test(normalized)) {
    throw new Error(`Claude real verification only permits GLM models; received ${normalized}`)
  }
}

function endpoint(baseUri: string, path: string): string {
  const base = baseUri.endsWith('/') ? baseUri : `${baseUri}/`
  return new URL(path.replace(/^\//u, ''), base).toString()
}

function diagnosticBody(body: string, authToken: string): string {
  const redacted = body.split(authToken).join('[REDACTED]').replace(/\s+/gu, ' ').trim()
  if (redacted.length <= MAX_DIAGNOSTIC_BODY_LENGTH) return redacted
  return `${redacted.slice(0, MAX_DIAGNOSTIC_BODY_LENGTH)}…`
}

function responseDiagnostic(endpointPath: string, response: Response, body: string, authToken: string): string {
  const bodyText = diagnosticBody(body, authToken)
  return bodyText.length === 0
    ? `${endpointPath} returned HTTP ${response.status}`
    : `${endpointPath} returned HTTP ${response.status}: ${bodyText}`
}

function classifyStatus(status: number): ClaudeProviderPreflightFailureKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'endpoint-mismatch'
  return 'protocol'
}

async function request(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ readonly response?: Response; readonly error?: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return { response: await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' }) }
  } catch (error) {
    return { error }
  } finally {
    clearTimeout(timer)
  }
}

function networkMessage(endpointPath: string, error: unknown, timeoutMs: number): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return `${endpointPath} timed out after ${timeoutMs}ms`
  }
  const message = error instanceof Error ? error.message : String(error)
  const suffix = message.length === 0 ? '' : `: ${message}`
  return `${endpointPath} could not be reached${suffix}`
}

function failedResponse(
  endpointPath: string,
  response: Response,
  body: string,
  authToken: string,
): Extract<ClaudeProviderPreflightResult, { readonly ok: false }> {
  return {
    ok: false,
    kind: classifyStatus(response.status),
    message: responseDiagnostic(endpointPath, response, body, authToken),
  }
}

/**
 * Verifies the Anthropic Messages API routes required by Claude Code.
 *
 * Claude Code uses the configured base URI with `GET /v1/models` for provider
 * discovery and `POST /v1/messages` for model requests. A successful models
 * response does not prove that the messages route exists, so both routes are
 * checked before starting a real Claude session. The messages probe sends an
 * invalid empty message list, allowing a reachable route to return validation
 * without consuming a model turn. Failures are classified as endpoint-mismatch,
 * auth, network, or protocol; no OpenAI-compatible route is accepted.
 */
export async function preflightClaudeProvider(options: ClaudeProviderPreflightOptions): Promise<ClaudeProviderPreflightResult> {
  assertClaudeRealModelAllowed(options.model)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers = {
    Authorization: `Bearer ${options.authToken}`,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  }
  const modelsPath = '/v1/models'
  const messagesPath = '/v1/messages'
  const models = await request(endpoint(options.baseUri, modelsPath), { method: 'GET', headers }, timeoutMs)
  if (models.error !== undefined) {
    return { ok: false, kind: 'network', message: networkMessage(modelsPath, models.error, timeoutMs) }
  }
  if (models.response === undefined) {
    return { ok: false, kind: 'network', message: `${modelsPath} did not produce an HTTP response` }
  }
  const modelsBody = await models.response.text().catch(() => '')
  if (models.response.status !== 200) {
    return failedResponse(`GET ${modelsPath}`, models.response, modelsBody, options.authToken)
  }

  const messages = await request(endpoint(options.baseUri, messagesPath), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.model,
      max_tokens: 1,
      messages: [],
    }),
  }, timeoutMs)
  if (messages.error !== undefined) {
    return { ok: false, kind: 'network', message: networkMessage(messagesPath, messages.error, timeoutMs) }
  }
  if (messages.response === undefined) {
    return { ok: false, kind: 'network', message: `${messagesPath} did not produce an HTTP response` }
  }
  const messagesBody = await messages.response.text().catch(() => '')
  if (messages.response.status === 404) {
    return {
      ok: false,
      kind: 'endpoint-mismatch',
      message: `Provider does not expose Anthropic POST ${messagesPath}; Claude SDK cannot use this provider (${responseDiagnostic(`POST ${messagesPath}`, messages.response, messagesBody, options.authToken)})`,
    }
  }
  if (messages.response.status === 401 || messages.response.status === 403) {
    return {
      ok: false,
      kind: 'auth',
      message: responseDiagnostic(`POST ${messagesPath}`, messages.response, messagesBody, options.authToken),
    }
  }
  if ((messages.response.status >= 200 && messages.response.status < 300 && messages.response.status !== 204)
    || messages.response.status === 400
    || messages.response.status === 422) {
    return { ok: true, modelsStatus: models.response.status, messagesStatus: messages.response.status }
  }
  return failedResponse(`POST ${messagesPath}`, messages.response, messagesBody, options.authToken)
}
