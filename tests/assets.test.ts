import assert from 'node:assert/strict'
import test from 'node:test'
import { EngineAssetRegistry } from '../src/assets.js'
import { EngineSuiteSettingsSchema } from '../src/settings.js'
import { EngineSuiteChildBridge } from '../src/orchestration/bridge.js'
import { renderCodexConfig } from '../src/codex/config.js'

test('Engine assets materialize MCP configuration without accepting secret-like static environment keys', () => {
  const assets = new EngineAssetRegistry()
  assert.throws(() => assets.registerMcpSet({
    id: 'unsafe',
    servers: [{ id: 'server', name: 'Server', transport: 'stdio', command: 'node', environment: { API_TOKEN: 'secret' } }],
  }), /secret-like static environment key/)
  const set = assets.registerMcpSet({
    id: 'safe',
    servers: [{ id: 'server', name: 'Server', transport: 'stdio', command: 'node', args: ['server.mjs'], environment: { LOG_LEVEL: 'debug' } }],
  })
  const materialized = renderCodexConfig({
    providerName: 'Provider', baseUri: 'https://example.test', model: 'model', apiKey: 'api-secret', mcpSet: set,
  })
  assert.match(materialized.configToml, /\[mcp_servers\.server\]/)
  assert.match(materialized.configToml, /LOG_LEVEL/)
  assert.doesNotMatch(materialized.configToml, /api-secret/)
})

test('Engine settings preserve every MCP transport field without persisting secrets', () => {
  const parsed = EngineSuiteSettingsSchema({
    providers: [],
    models: [],
    mcpSets: [{
      id: 'all-transports',
      servers: [
        { id: 'stdio', name: 'stdio', transport: 'stdio', command: 'node', args: ['server.mjs'], environment: { LOG_LEVEL: 'debug' }, credentialRefs: { API_TOKEN: 'stdio-token' } },
        { id: 'http', name: 'http', transport: 'http', url: 'https://http.example.test', headers: { 'x-tenant': 'tenant-a' }, credentialRefs: { Authorization: 'http-token' } },
        { id: 'sse', name: 'sse', transport: 'sse', url: 'https://sse.example.test', headers: { 'x-tenant': 'tenant-b' }, credentialRefs: { Authorization: 'sse-token' } },
      ],
    }],
  })

  assert.deepEqual(parsed.mcpSets, [{
    id: 'all-transports',
    servers: [
      { id: 'stdio', name: 'stdio', transport: 'stdio', command: 'node', args: ['server.mjs'], environment: { LOG_LEVEL: 'debug' }, credentialRefs: { API_TOKEN: 'stdio-token' } },
      { id: 'http', name: 'http', transport: 'http', url: 'https://http.example.test', headers: { 'x-tenant': 'tenant-a' }, credentialRefs: { Authorization: 'http-token' } },
      { id: 'sse', name: 'sse', transport: 'sse', url: 'https://sse.example.test', headers: { 'x-tenant': 'tenant-b' }, credentialRefs: { Authorization: 'sse-token' } },
    ],
  }])
})

test('Engine settings reject transport-exclusive fields and explicit undefined fields', async () => {
  const parse = async (server: unknown): Promise<unknown> => {
    const result = await EngineSuiteSettingsSchema['~standard'].validate({
      providers: [],
      models: [],
      mcpSets: [{ id: 'invalid', servers: [server] }],
    })
    if (result.issues !== undefined) throw new Error(result.issues.map(issue => issue.message).join('; '))
    return result.value
  }

  await assert.rejects(() => parse({ id: 'stdio-url', name: 'stdio', transport: 'stdio', command: 'node', url: 'https://invalid.example.test' }))
  await assert.rejects(() => parse({ id: 'stdio-undefined-url', name: 'stdio', transport: 'stdio', command: 'node', url: undefined }))
  await assert.rejects(() => parse({ id: 'http-command', name: 'http', transport: 'http', url: 'https://invalid.example.test', command: 'node' }))
  await assert.rejects(() => parse({ id: 'http-environment', name: 'http', transport: 'http', url: 'https://invalid.example.test', environment: {} }))
  await assert.rejects(() => parse({ id: 'sse-args', name: 'sse', transport: 'sse', url: 'https://invalid.example.test', args: [] }))
})

test('Codex materialization reads environment only for stdio MCP servers', () => {
  const assets = new EngineAssetRegistry()
  const set = assets.registerMcpSet({
    id: 'remote-transports',
    servers: [
      { id: 'http', name: 'http', transport: 'http', url: 'https://http.example.test', headers: { 'x-tenant': 'tenant-a' } },
      { id: 'sse', name: 'sse', transport: 'sse', url: 'https://sse.example.test' },
    ],
  })
  const materialized = renderCodexConfig({
    providerName: 'Provider', baseUri: 'https://example.test', model: 'model', apiKey: 'api-secret', mcpSet: set,
  })
  assert.match(materialized.configToml, /url = "https:\/\/http\.example\.test"/)
  assert.match(materialized.configToml, /url = "https:\/\/sse\.example\.test"/)
  assert.doesNotMatch(materialized.configToml, /env =/)
})

test('Engine Suite child bridge authenticates local MCP delegation requests', async () => {
  const bridge = new EngineSuiteChildBridge(async request => ({ childSessionId: 'child-1', text: `${request.profileId}:${request.task}` }))
  await bridge.start()
  try {
    const launch = bridge.launchFor('parent-1')
    const response = await fetch(`${launch.serverUrl}/delegate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-engine-suite-token': launch.token },
      body: JSON.stringify({ parentSessionId: 'parent-1', profileId: 'child-profile', task: 'inspect' }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, value: { childSessionId: 'child-1', text: 'child-profile:inspect' } })
    const denied = await fetch(`${launch.serverUrl}/delegate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-engine-suite-token': 'wrong' },
      body: JSON.stringify({ parentSessionId: 'parent-1', profileId: 'child-profile', task: 'inspect' }),
    })
    assert.equal(denied.status, 401)
  } finally {
    await bridge.close()
  }
})

test('child bridge MCP stdio server exposes initialize, tools/list, and tools/call', async () => {
  const bridge = new EngineSuiteChildBridge(async request => ({ childSessionId: 'child-stdio', text: `${request.profileId}:${request.task}` }))
  await bridge.start()
  const launch = bridge.launchFor('parent-stdio')
  const child = (await import('node:child_process')).spawn(process.execPath, ['--import', 'tsx', 'src/orchestration/mcp-server.ts', ...launch.mcpServer.args.slice(1)], {
    cwd: process.cwd(),
    env: { ...process.env, ...launch.environment },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buffer = ''
  const next = (): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
    const onData = (chunk: Buffer | string): void => {
      buffer += String(chunk)
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      child.stdout.off('data', onData)
      try { resolve(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>); buffer = buffer.slice(newline + 1) } catch (error: unknown) { reject(error) }
    }
    child.stdout.on('data', onData)
  })
  const send = (value: unknown): void => { child.stdin.write(`${JSON.stringify(value)}\n`) }
  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    assert.equal((await next())['id'], 1)
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const listed = await next()
    assert.match(JSON.stringify(listed), /engine_suite_delegate/)
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'engine_suite_delegate', arguments: { profileId: 'child-profile', task: 'stdio task' } } })
    const called = await next()
    assert.match(JSON.stringify(called), /child-stdio/)
  } finally {
    child.kill('SIGTERM')
    await bridge.close()
  }
})
