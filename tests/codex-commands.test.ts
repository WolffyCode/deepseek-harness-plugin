import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import test from 'node:test'
import { apply } from '../src/index.js'
import type { EngineSuiteRuntimeService } from '../src/plugin.js'

function codexServer(auditPath: string): string { return [
  "const fs=require('node:fs');", "const rl=require('node:readline').createInterface({input:process.stdin});",
  `const log=value=>fs.appendFileSync(${JSON.stringify(auditPath)},JSON.stringify(value)+'\\n');`,
  "rl.on('line',line=>{const m=JSON.parse(line);",
  "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
  "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'command-thread',ephemeral:false}}})+'\\n');",
  "else if(m.method==='skills/extraRoots/set'){log({method:m.method,params:m.params}); process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{}})+'\\n');}",
  "else if(m.method==='skills/list'){log({method:m.method,params:m.params}); process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{data:[null,{cwd:m.params.cwds[0],skills:[null,{name:'',description:'empty'},{name:'disabled',description:'Disabled',enabled:false},{name:'review',description:'Review files'},{name:'review',description:'Do not replace first'},{name:'metadata',interface:{shortDescription:'Metadata skill'}}],errors:[{message:'ignored fixture error'}]}]}})+'\\n');}",
  "else if(m.method==='turn/start'){log({method:m.method,input:m.params.input}); process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{turn:{id:'command-turn'}}})+'\\n'); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{turnId:'command-turn',delta:'ok'}})+'\\n'),5); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'command-turn',status:'completed'}}})+'\\n'),10);}",
  "});",
].join('') }
async function audit(path: string): Promise<readonly Record<string, unknown>[]> { const text = await readFile(path, 'utf8').catch(() => ''); return text.trim() === '' ? [] : text.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>) }

test('Codex skills/list owns the session command directory, refreshes natively, and preserves raw input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-commands-')), auditPath = join(root, 'audit.jsonl')
  const ctx = new Context(); await ctx.plugin(SessionStore); await ctx.plugin(AgentRegistry); apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  suite.providers.register({ id: 'commands-provider', engineId: 'codex-cli', name: 'Commands Provider', baseUri: 'https://example.test', credentialRef: 'commands-key' })
  suite.models.register({ id: 'commands-model', engineId: 'codex-cli', providerId: 'commands-provider', modelId: 'gpt-commands', reasoningOptions: [{ id: 'high' }], source: 'manual' })
  suite.assets.registerSkillSet({ id: 'codex-skills', pluginDirs: ['/ignored/claude-plugin'], additionalDirectories: ['/native/skills'] })
  suite.profiles.register({ id: 'commands-profile', selection: { engineId: 'codex-cli', providerId: 'commands-provider', modelRecordId: 'commands-model', reasoningEffort: 'high' }, skillSetRef: 'codex-skills' })
  const handle = await suite.agents.createCodex({ sessionId: 'commands-agent', selection: { engineId: 'codex-cli', providerId: 'commands-provider', modelRecordId: 'commands-model', reasoningEffort: 'high' }, apiKey: 'commands-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', codexServer(auditPath)] })
  try {
    const commands = await handle.listCommands(true)
    assert.deepEqual(commands, [{ name: 'review', description: 'Review files', argumentHint: '', source: 'skill' }, { name: 'metadata', description: 'Metadata skill', argumentHint: '', source: 'skill' }])
    assert.deepEqual(await handle.listCommands(false), commands); await handle.listCommands(true)
    const calls = await audit(auditPath), roots = calls.filter(entry => entry['method'] === 'skills/extraRoots/set'), lists = calls.filter(entry => entry['method'] === 'skills/list')
    assert.deepEqual(roots[0]?.['params'], { extraRoots: ['/native/skills'] }); assert.equal(roots.length, 1); assert.equal(lists.length, 2)
    assert.deepEqual(lists.map(entry => (entry['params'] as Record<string, unknown>)['forceReload']), [true, true])
    const raw = '/review  "quoted argument"  tail'; handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: raw }], source: { kind: 'user' } })); await handle.agent.whenIdle()
    const turn = (await audit(auditPath)).find(entry => entry['method'] === 'turn/start')
    assert.equal(((turn?.['input'] as readonly Record<string, unknown>[] | undefined)?.[0])?.['text'], raw)
  } finally { await handle.dispose(); await rm(root, { recursive: true, force: true }) }
  await assert.rejects(handle.listCommands(), /session is closed/u)
})
