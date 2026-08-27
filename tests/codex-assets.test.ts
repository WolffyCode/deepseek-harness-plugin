import assert from 'node:assert/strict'
import test from 'node:test'
import { renderCodexConfig, resolveCodexMcpEnvironment } from '../src/codex/config.js'
import type { EngineMcpSet } from '../src/assets.js'

const mcpSet: EngineMcpSet = { id: 'codex-assets', servers: [
  { id: 'local-tools', name: 'Local tools', transport: 'stdio', command: 'node', args: ['server.mjs'], environment: { FIXTURE_MODE: 'test' }, credentialRefs: { FIXTURE_TOKEN: 'token-ref' } },
  { id: 'remote-tools', name: 'Remote tools', transport: 'http', url: 'https://mcp.example.test/rpc', headers: { 'X-Fixture': 'static' }, credentialRefs: { Authorization: 'auth-ref' } },
] }

test('Codex MCP uses native stdio and streamable HTTP fields without secrets in TOML', async () => {
  const materialized = renderCodexConfig({ providerName: 'fixture-provider', baseUri: 'https://api.example.test/', model: 'gpt-fixture', apiKey: 'provider-secret', mcpSet })
  assert.match(materialized.configToml, /\[mcp_servers\.local-tools\]/)
  assert.match(materialized.configToml, /env = \{"FIXTURE_MODE":"test"\}/)
  assert.match(materialized.configToml, /env_vars = \["FIXTURE_TOKEN"\]/)
  assert.match(materialized.configToml, /\[mcp_servers\.remote-tools\]/)
  assert.match(materialized.configToml, /http_headers = \{"X-Fixture":"static"\}/)
  assert.match(materialized.configToml, /env_http_headers = \{"Authorization":"Authorization"\}/)
  assert.doesNotMatch(materialized.configToml, /\nheaders = /)
  assert.doesNotMatch(materialized.configToml, /token-ref|auth-ref|provider-secret/)
  assert.deepEqual(await resolveCodexMcpEnvironment(mcpSet, async ref => ({ 'token-ref': 'runtime-token', 'auth-ref': 'runtime-auth' }[ref])), { FIXTURE_TOKEN: 'runtime-token', Authorization: 'runtime-auth' })
})

test('Codex MCP credentials resolve once and reject missing or conflicting refs', async () => {
  let calls = 0
  const resolved = await resolveCodexMcpEnvironment({ id: 'deduplicated', servers: [
    { id: 'one', name: 'One', transport: 'stdio', command: 'one', credentialRefs: { TOKEN: 'same-ref' } },
    { id: 'two', name: 'Two', transport: 'stdio', command: 'two', credentialRefs: { TOKEN: 'same-ref' } },
  ] }, async () => { calls += 1; return 'same-secret' })
  assert.equal(calls, 1); assert.deepEqual(resolved, { TOKEN: 'same-secret' })
  await assert.rejects(resolveCodexMcpEnvironment({ id: 'missing', servers: [{ id: 'one', name: 'One', transport: 'stdio', command: 'one', credentialRefs: { TOKEN: 'missing' } }] }, async () => undefined), /credential resolution failed: missing/u)
  await assert.rejects(resolveCodexMcpEnvironment({ id: 'conflicting', servers: [
    { id: 'one', name: 'One', transport: 'stdio', command: 'one', credentialRefs: { TOKEN: 'first' } },
    { id: 'two', name: 'Two', transport: 'stdio', command: 'two', credentialRefs: { TOKEN: 'second' } },
  ] }, async ref => ref), /shared by different references: TOKEN/u)
})

test('Codex materializes SSE as a remote URL without stdio environment fields', () => {
  const materialized = renderCodexConfig({ providerName: 'fixture', baseUri: 'https://api.example.test', model: 'model', apiKey: 'key', mcpSet: { id: 'sse', servers: [{ id: 'sse', name: 'SSE', transport: 'sse', url: 'https://mcp.example.test/events' }] } })
  assert.match(materialized.configToml, /\[mcp_servers\.sse\]/)
  assert.match(materialized.configToml, /url = \"https:\/\/mcp\.example\.test\/events\"/)
  assert.doesNotMatch(materialized.configToml, /(?:^|\n)(?:env|env_vars|environment) =/u)
})

test('Codex rejects forbidden transport fields, static secret-like env, and key collisions', () => {
  const base = { providerName: 'fixture', baseUri: 'https://api.example.test', model: 'model', apiKey: 'key' }
  assert.throws(() => renderCodexConfig({ ...base, mcpSet: { id: 'static', servers: [{ id: 'stdio', name: 'stdio', transport: 'stdio', command: 'node', environment: { API_TOKEN: 'secret' } }] } }), /secret-like static environment key: API_TOKEN/u)
  assert.throws(() => renderCodexConfig({ ...base, mcpSet: { id: 'stdio-boundary', servers: [{ id: 'stdio', name: 'stdio', transport: 'stdio', command: 'node', url: undefined } as never] } }), /stdio MCP server stdio must not declare url/u)
  assert.throws(() => renderCodexConfig({ ...base, mcpSet: { id: 'http-boundary', servers: [{ id: 'http', name: 'http', transport: 'http', url: 'https://mcp.example.test', command: undefined } as never] } }), /http MCP server http must not declare command/u)
  assert.throws(() => renderCodexConfig({ ...base, mcpSet: { id: 'collision', servers: [{ id: 'a b', name: 'A', transport: 'stdio', command: 'a' }, { id: 'a_b', name: 'B', transport: 'stdio', command: 'b' }] } }), /same Codex key/u)
})
