import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'
import type { EngineSelection } from '../src/profile/types.js'

const selection: EngineSelection = {
  engineId: 'codex-cli',
  providerId: 'integration-provider',
  modelRecordId: 'integration-model',
  reasoningEffort: 'high',
}

function serverScript(): string {
  return [
    "const fs=require('node:fs');",
    "const readline=require('node:readline');",
    "const audit=process.env.DSH_CODEX_AUDIT;",
    "const calls=[];",
    "function log(method,params){calls.push({method,params}); if(audit) fs.writeFileSync(audit,JSON.stringify({calls,hasMcpCredential:process.env.INTEGRATION_MCP_TOKEN==='mcp-secret'&&process.env.INTEGRATION_MCP_TOKEN_2==='mcp-secret',hasProviderCredential:process.env.OPENAI_API_KEY==='provider-secret'}));}",
    "function reply(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');}",
    "const rl=readline.createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line); log(m.method,m.params);",
    "if(m.method==='initialize') reply(m.id,{ok:true});",
    "else if(m.method==='thread/start') reply(m.id,{thread:{id:'integration-thread',ephemeral:false}});",
    "else if(m.method==='thread/resume') reply(m.id,{thread:{id:m.params.threadId,ephemeral:false}});",
    "else if(m.method==='skills/extraRoots/set') reply(m.id,{});",
    "});",
  ].join('')
}

function failedServerScript(): string {
  return [
    "const readline=require('node:readline');",
    "const rl=readline.createInterface({input:process.stdin});",
    "rl.once('line',line=>{const m=JSON.parse(line); if(m.method==='initialize'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n'); process.stdout.end();}});",
  ].join('')
}

function registerSuite(resolved: string[]): ReturnType<typeof createEngineSuiteRuntime> {
  const suite = createEngineSuiteRuntime({
    credentialResolver: async reference => {
      resolved.push(reference)
      return reference === 'integration-mcp-ref' ? 'mcp-secret' : undefined
    },
  })
  suite.providers.register({
    id: 'integration-provider',
    engineId: 'codex-cli',
    name: 'Integration Provider',
    baseUri: 'https://example.test',
    credentialRef: 'provider-credential',
  })
  suite.models.register({
    id: 'integration-model',
    engineId: 'codex-cli',
    providerId: 'integration-provider',
    modelId: 'gpt-integration',
    reasoningOptions: [{ id: 'high' }],
    source: 'manual',
  })
  suite.assets.registerMcpSet({
    id: 'integration-mcp',
    servers: [{
      id: 'integration-server',
      name: 'Integration MCP',
      transport: 'stdio',
      command: 'integration-mcp',
      credentialRefs: { INTEGRATION_MCP_TOKEN: 'integration-mcp-ref', INTEGRATION_MCP_TOKEN_2: 'integration-mcp-ref' },
    }],
  })
  suite.assets.registerSkillSet({
    id: 'integration-skills',
    pluginDirs: [],
    additionalDirectories: ['/native/one', '/native/two', '/native/one'],
  })
  suite.profiles.register({
    id: 'integration-profile',
    selection,
    mcpSetRef: 'integration-mcp',
    skillSetRef: 'integration-skills',
  })
  return suite
}

function openOptions(root: string, script: string): Parameters<ReturnType<typeof createEngineSuiteRuntime>['openEngine']>[1] {
  return {
    apiKey: 'provider-secret',
    cwd: process.cwd(),
    runtimeRoot: root,
    preserveRuntimeRoot: true,
    executable: process.execPath,
    args: ['-e', script],
    disposeGraceMs: 50,
  }
}

test('public EngineSuite Codex wiring resolves MCP credentials into child env and injects native skill roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-integration-'))
  const audit = join(root, 'audit.json')
  const resolved: string[] = []
  const suite = registerSuite(resolved)
  let launch: Awaited<ReturnType<typeof suite.openEngine>> | undefined
  try {
    launch = await suite.openEngine(selection, {
      ...openOptions(root, serverScript()),
      environment: { DSH_CODEX_AUDIT: audit },
    })
    assert.equal(launch.nativeSessionId, 'integration-thread')
    assert.deepEqual(resolved, ['integration-mcp-ref'])

    const config = await readFile(join(root, 'codex-home', 'config.toml'), 'utf8')
    assert.match(config, /env_vars = \["INTEGRATION_MCP_TOKEN","INTEGRATION_MCP_TOKEN_2"\]/u)
    assert.doesNotMatch(config, /mcp-secret|integration-mcp-ref|provider-secret/u)

    const auditText = await readFile(audit, 'utf8')
    assert.doesNotMatch(auditText, /mcp-secret|provider-secret/u)
    const auditState = JSON.parse(auditText) as {
      readonly calls: readonly { readonly method: string; readonly params?: unknown }[]
      readonly hasMcpCredential: boolean
      readonly hasProviderCredential: boolean
    }
    assert.equal(auditState.hasMcpCredential, true)
    assert.equal(auditState.hasProviderCredential, true)
    assert.deepEqual(
      auditState.calls.find(call => call.method === 'skills/extraRoots/set')?.params,
      { extraRoots: ['/native/one', '/native/two'] },
    )

    await Promise.all([launch.close(), launch.close()])
    assert.equal((await stat(root)).isDirectory(), true)

    const resumed = await suite.openCodex(selection, {
      ...openOptions(root, serverScript()),
      resumeThreadId: 'persisted-thread',
      environment: { DSH_CODEX_AUDIT: audit },
    })
    try {
      assert.equal(resumed.runtime.threadId, 'persisted-thread')
      assert.deepEqual(resolved, ['integration-mcp-ref', 'integration-mcp-ref'])
      const resumedText = await readFile(audit, 'utf8')
      assert.doesNotMatch(resumedText, /mcp-secret|provider-secret/u)
      const resumedAudit = JSON.parse(resumedText) as { readonly calls: readonly { readonly method: string; readonly params?: unknown }[] }
      assert.ok(resumedAudit.calls.some(call => call.method === 'thread/resume'))
      assert.deepEqual(
        resumedAudit.calls.find(call => call.method === 'skills/extraRoots/set')?.params,
        { extraRoots: ['/native/one', '/native/two'] },
      )
    } finally {
      await resumed.close()
    }
  } finally {
    await launch?.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('public EngineSuite Codex launch removes the root after startup failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-integration-failure-'))
  const suite = registerSuite([])
  try {
    await assert.rejects(suite.openCodex(selection, {
      ...openOptions(root, failedServerScript()),
      preserveRuntimeRoot: false,
    }), /closed|JSON-RPC/u)
    await assert.rejects(stat(root), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
