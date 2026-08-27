import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openCodexLaunch } from '../src/codex/launch.js'
import type { ModelRecord } from '../src/model/types.js'
import type { EngineProvider } from '../src/provider/types.js'
import type { EngineProfileSnapshot } from '../src/profile/types.js'

const provider: EngineProvider = {
  id: 'c3-provider',
  engineId: 'codex-cli',
  name: 'C3 Provider',
  baseUri: 'https://example.test',
  credentialRef: 'c3-credential',
  wireApi: 'responses',
  authMode: 'api-key',
  enabled: true,
  status: 'unknown',
}
const model: ModelRecord = {
  id: 'c3-model',
  engineId: 'codex-cli',
  providerId: provider.id,
  modelId: 'gpt-c3',
  enabled: true,
  hidden: false,
  reasoningOptions: [{ id: 'high' }],
  inputModalities: ['text'],
  contextWindowSource: 'unknown',
  source: 'manual',
}
const profile: EngineProfileSnapshot = {
  id: 'c3-profile',
  name: 'C3 profile',
  revision: 1,
  engineId: 'codex-cli',
  providerId: provider.id,
  modelRecordId: model.id,
  modelId: model.modelId,
  reasoningEffort: 'high',
  allowedChildProfiles: [],
  maxChildDepth: 0,
  maxConcurrentChildren: 0,
  snapshot: true,
}

function serverScript(): string {
  return [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:process.env.OPENAI_API_KEY==='launch-secret'?'env-ok':'env-bad'}}})+'\\n');",
    "else if(m.method==='thread/resume') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:m.params.threadId,ephemeral:false}}})+'\\n');",
    "});",
  ].join('')
}

function launchOptions(runtimeRoot: string, overrides: Record<string, unknown> = {}): Parameters<typeof openCodexLaunch>[0] {
  return {
    profile,
    provider,
    model,
    apiKey: 'launch-secret',
    cwd: process.cwd(),
    runtimeRoot,
    executable: process.execPath,
    args: ['-e', serverScript()],
    disposeGraceMs: 25,
    ...overrides,
  } as Parameters<typeof openCodexLaunch>[0]
}

test('openCodexLaunch materializes an isolated home, resumes a thread, and removes root on close', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-launch-'))
  const launch = await openCodexLaunch(launchOptions(root, {
    environment: { OPENAI_API_KEY: 'must-not-override', CODEX_HOME: '/tmp/must-not-override' },
    resumeThreadId: 'resumed-thread',
  }))
  try {
    assert.equal(launch.runtime.threadId, 'resumed-thread')
    assert.equal(launch.codexHome, join(root, 'codex-home'))
    const config = await readFile(join(launch.codexHome, 'config.toml'), 'utf8')
    assert.doesNotMatch(config, /launch-secret/)
    await launch.close()
    await assert.rejects(stat(root), { code: 'ENOENT' })
    await launch.close()
  } finally {
    await launch.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('openCodexLaunch preserves the runtime root only when requested', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-launch-preserve-'))
  const launch = await openCodexLaunch(launchOptions(root, { preserveRuntimeRoot: true }))
  try {
    await launch.close()
    assert.equal((await stat(root)).isDirectory(), true)
    assert.equal((await stat(join(root, 'codex-home'))).isDirectory(), true)
  } finally {
    await launch.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('openCodexLaunch cleans the root and process when thread initialization fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-launch-failure-'))
  const script = "const rl=require('node:readline').createInterface({input:process.stdin}); rl.on('line',line=>{const m=JSON.parse(line); if(m.method==='initialize') process.stdout.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');}); setInterval(()=>{},1000);"
  await assert.rejects(openCodexLaunch(launchOptions(root, { args: ['-e', script] })), /JSON-RPC input closed|closed|timeout/i)
  await assert.rejects(stat(root), { code: 'ENOENT' })
})

test('openCodexLaunch preserves a durable root when startup fails with preservation enabled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-launch-failure-preserve-'))
  const script = "const rl=require('node:readline').createInterface({input:process.stdin}); rl.once('line',line=>{const m=JSON.parse(line); if(m.method==='initialize'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\n'); process.stdout.end();}});"
  try {
    await assert.rejects(openCodexLaunch(launchOptions(root, { args: ['-e', script], preserveRuntimeRoot: true })), /JSON-RPC input closed|closed|timeout/i)
    assert.equal((await stat(root)).isDirectory(), true)
    assert.equal((await stat(join(root, 'codex-home'))).isDirectory(), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('openCodexLaunch rejects MCP credentials that shadow launcher-owned environment keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-launch-credential-collision-'))
  try {
    await assert.rejects(openCodexLaunch(launchOptions(root, {
      mcpSet: { id: 'collision', servers: [{ id: 'mcp', name: 'MCP', transport: 'stdio', command: 'mcp', credentialRefs: { OPENAI_API_KEY: 'mcp-ref' } }] },
      credentialResolver: async () => 'mcp-secret',
    })), /reserved by the launcher: OPENAI_API_KEY/u)
    await assert.rejects(stat(root), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }

  const environmentRoot = await mkdtemp(join(tmpdir(), 'dsh-codex-launch-credential-environment-collision-'))
  try {
    await assert.rejects(openCodexLaunch(launchOptions(environmentRoot, {
      mcpSet: { id: 'collision', servers: [{ id: 'mcp', name: 'MCP', transport: 'stdio', command: 'mcp', credentialRefs: { DSH_ENGINE_SUITE_BRIDGE_TOKEN: 'mcp-ref' } }] },
      credentialResolver: async () => 'mcp-secret',
      environment: { DSH_ENGINE_SUITE_BRIDGE_TOKEN: 'host-secret' },
    })), /conflicts with launch environment: DSH_ENGINE_SUITE_BRIDGE_TOKEN/u)
    await assert.rejects(stat(environmentRoot), { code: 'ENOENT' })
  } finally {
    await rm(environmentRoot, { recursive: true, force: true })
  }
})

test('openCodexLaunch rejects mismatched selections before creating a runtime root', async () => {
  const root = join(tmpdir(), `dsh-codex-launch-mismatch-${process.pid}`)
  await assert.rejects(openCodexLaunch(launchOptions(root, {
    profile: { ...profile, providerId: 'other-provider' },
  })), /profile provider does not match launch provider/)
  await assert.rejects(stat(root), { code: 'ENOENT' })
  await assert.rejects(openCodexLaunch(launchOptions(root, {
    model: { ...model, providerId: 'other-provider' },
  })), /model does not belong to Codex provider/)
  await assert.rejects(stat(root), { code: 'ENOENT' })
})
