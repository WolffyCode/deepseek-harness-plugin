import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type ClaudeCredentialResolver,
  type CanonicalMcpSet,
  materializeClaudeMcp,
  materializeClaudeMcpOptions,
} from '../src/claude/mcp.js'

function fakeResolver(values: Readonly<Record<string, string>>, calls: string[] = []): ClaudeCredentialResolver {
  return {
    resolve(reference: string): string | undefined {
      calls.push(reference)
      return values[reference]
    },
  }
}

const userAssets: CanonicalMcpSet = {
  servers: [
    {
      name: 'local-tools',
      transport: 'stdio',
      command: 'node',
      args: ['server.mjs'],
      env: { MODE: 'test', API_KEY: 'not-allowed-as-static-secret' },
      credentialRefs: { API_KEY: 'runtime-api-key' },
    },
    {
      name: 'remote-tools',
      transport: 'http',
      url: 'https://mcp.example.test/http',
      headers: { Accept: 'application/json' },
      credentialRefs: { Authorization: 'runtime-auth' },
      alwaysLoad: true,
    },
    {
      name: 'legacy-tools',
      transport: 'sse',
      url: 'https://mcp.example.test/sse',
    },
  ],
}

void userAssets

test('materializes stdio, http, and sse using native Claude SDK shapes', () => {
  const calls: string[] = []
  const result = materializeClaudeMcpOptions(
    {
      servers: [
        {
          name: 'local-tools',
          transport: 'stdio',
          command: 'node',
          args: ['server.mjs'],
          env: { MODE: 'test' },
          credentialRefs: { API_KEY: 'runtime-api-key' },
        },
        {
          name: 'remote-tools',
          transport: 'http',
          url: 'https://mcp.example.test/http',
          headers: { Accept: 'application/json' },
          credentialRefs: { Authorization: 'runtime-auth' },
          alwaysLoad: true,
        },
        {
          name: 'legacy-tools',
          transport: 'sse',
          url: 'https://mcp.example.test/sse',
        },
      ],
    },
    { credentialResolver: fakeResolver({ 'runtime-api-key': 'runtime-value', 'runtime-auth': 'runtime-header' }, calls) },
  )

  assert.deepEqual(result, {
    mcpServers: {
      'local-tools': {
        type: 'stdio',
        command: 'node',
        args: ['server.mjs'],
        env: { MODE: 'test', API_KEY: 'runtime-value' },
      },
      'remote-tools': {
        type: 'http',
        url: 'https://mcp.example.test/http',
        headers: { Accept: 'application/json', Authorization: 'runtime-header' },
        alwaysLoad: true,
      },
      'legacy-tools': {
        type: 'sse',
        url: 'https://mcp.example.test/sse',
      },
    },
  })
  assert.deepEqual(calls, ['runtime-api-key', 'runtime-auth'])
})

test('credential references override static values without mutating input', () => {
  const input = {
    servers: [{
      name: 'remote-tools',
      transport: 'http' as const,
      url: 'https://mcp.example.test',
      headers: { 'X-Mode': 'placeholder', Accept: 'application/json' },
      credentialRefs: { 'X-Mode': 'auth-ref' },
    }],
  }
  const before = structuredClone(input)
  const result = materializeClaudeMcp(input, { credentialResolver: fakeResolver({ 'auth-ref': 'runtime-header' }) })

  assert.deepEqual(result, {
    'remote-tools': {
      type: 'http',
      url: 'https://mcp.example.test',
      headers: { 'X-Mode': 'runtime-header', Accept: 'application/json' },
    },
  })
  assert.deepEqual(input, before)
})

test('requires a resolver only when credential references are present', () => {
  assert.throws(
    () => materializeClaudeMcp({
      servers: [{ name: 'remote-tools', transport: 'http', url: 'https://mcp.example.test', credentialRefs: { Authorization: 'auth-ref' } }],
    }, {}),
    error => error instanceof Error && error.message.includes('MCP_CREDENTIAL_RESOLVER_MISSING') && error.message.includes('mcpServers.remote-tools.credentialRefs.Authorization'),
  )
  assert.throws(
    () => materializeClaudeMcp({
      servers: [{ name: 'remote-tools', transport: 'http', url: 'https://mcp.example.test', credentialRefs: { Authorization: 'auth-ref' } }],
    }, { credentialResolver: fakeResolver({}) }),
    error => error instanceof Error && error.message.includes('MCP_CREDENTIAL_MISSING') && error.message.includes('mcpServers.remote-tools.credentialRefs.Authorization'),
  )
})

test('rejects internal assets, invalid configurations, and unsupported SDK transports diagnostically', () => {
  assert.throws(
    () => materializeClaudeMcp({
      servers: [{ name: 'harness', scope: 'internal', transport: 'http', url: 'https://mcp.example.test' }],
    }, {}),
    error => error instanceof Error && error.message.includes('CLAUDE_ASSET_SCOPE_FORBIDDEN') && error.message.includes('mcpServers.harness'),
  )
  assert.throws(
    () => materializeClaudeMcp({
      servers: [{ name: 'broken', transport: 'stdio', command: 'node', url: 'https://mcp.example.test' }],
    }, {}),
    error => error instanceof Error && error.message.includes('MCP_CONFLICTING_FIELDS') && error.message.includes('mcpServers.broken.url'),
  )
  assert.throws(
    () => materializeClaudeMcp({
      servers: [{ name: 'legacy-tools', transport: 'sse', url: 'https://mcp.example.test/sse' }],
    }, { sdkSupport: { stdio: true, http: true, sse: false } }),
    error => error instanceof Error && error.message.includes('MCP_SDK_UNSUPPORTED_TRANSPORT') && error.message.includes('mcpServers.legacy-tools.transport'),
  )
})
