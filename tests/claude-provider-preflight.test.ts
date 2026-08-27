import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import {
  assertClaudeRealModelAllowed,
  preflightClaudeProvider,
} from '../src/claude/provider-preflight.js'

async function withServer(handler: http.RequestListener, run: (baseUri: string) => Promise<void>): Promise<void> {
  const server = http.createServer(handler)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

async function unusedBaseUri(): Promise<string> {
  const server = http.createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUri = `http://127.0.0.1:${address.port}`
  await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  return baseUri
}

function preflight(baseUri: string, authToken = 'test-token') {
  return preflightClaudeProvider({ baseUri, authToken, model: 'glm-5.3', timeoutMs: 1_000 })
}

for (const [status, kind] of [[401, 'auth'], [403, 'auth'], [404, 'endpoint-mismatch'], [500, 'protocol']] as const) {
  test(`classifies GET /v1/models HTTP ${status} as ${kind}`, async () => {
    await withServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'provider diagnostic' }))
    }, async baseUri => {
      const result = await preflight(baseUri)
      assert.equal(result.ok, false)
      if (result.ok) return
      assert.equal(result.kind, kind)
      assert.match(result.message, new RegExp(`GET /v1/models returned HTTP ${status}`))
    })
  })
}

test('classifies a reachable Anthropic messages route auth failure as auth', async () => {
  await withServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200)
      response.end('{}')
      return
    }
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'invalid provider credentials' }))
  }, async baseUri => {
    const result = await preflight(baseUri)
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.kind, 'auth')
    assert.match(result.message, /POST \/v1\/messages returned HTTP 401/)
  })
})

test('distinguishes a missing Anthropic messages route from models discovery', async () => {
  const secret = 'preflight-secret-must-not-escape'
  const requests: Array<{ method: string; path: string; authorization?: string; body?: string }> = []
  await withServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += String(chunk) })
    request.on('end', () => {
      requests.push({
        method: request.method ?? '',
        path: request.url ?? '',
        ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
        body,
      })
      if (request.method === 'GET' && request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ data: [{ id: 'glm-5.3' }] }))
        return
      }
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: `missing route ${secret}` }))
    })
  }, async baseUri => {
    const result = await preflightClaudeProvider({ baseUri, authToken: secret, model: 'glm-5.3', timeoutMs: 1_000 })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.kind, 'endpoint-mismatch')
    assert.match(result.message, /Provider does not expose Anthropic POST \/v1\/messages/)
    assert.match(result.message, /HTTP 404/)
    assert.equal(result.message.includes(secret), false)
    assert.deepEqual(requests.map(request => [request.method, request.path]), [['GET', '/v1/models'], ['POST', '/v1/messages']])
    assert.equal(requests[1]?.authorization, `Bearer ${secret}`)
    assert.deepEqual(JSON.parse(requests[1]?.body ?? '{}'), {
      model: 'glm-5.3',
      max_tokens: 1,
      messages: [],
    })
  })
})

test('treats an authenticated messages validation response as a reachable route without a model turn', async () => {
  await withServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{}')
      return
    }
    response.writeHead(400, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'validation reached the Anthropic route' }))
  }, async baseUri => {
    const result = await preflight(baseUri)
    assert.deepEqual(result, { ok: true, modelsStatus: 200, messagesStatus: 400 })
  })
})

test('classifies an unreachable provider as network', async () => {
  const result = await preflight(await unusedBaseUri())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.kind, 'network')
})

test('allows only GLM models and rejects Opus before any request', () => {
  assert.doesNotThrow(() => assertClaudeRealModelAllowed('glm-5.3'))
  assert.doesNotThrow(() => assertClaudeRealModelAllowed('GLM_4.5'))
  assert.throws(() => assertClaudeRealModelAllowed('claude-sonnet'), /only permits GLM models/)
  assert.throws(() => assertClaudeRealModelAllowed('glm-opus'), /rejects Opus model/)
})
