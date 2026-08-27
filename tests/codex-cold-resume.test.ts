import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import test from 'node:test'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'
import { EngineSuiteAgentService } from '../src/agent/service.js'
import { ExternalEngineBindingStore } from '../src/engine/bindings.js'
import type { EngineSelection } from '../src/profile/types.js'

function serverScript(): string {
  return [
    "const fs=require('node:fs');",
    "const readline=require('node:readline');",
    "const marker=process.argv[1];",
    "const sentinel=process.argv[2];",
    "fs.appendFileSync(marker,JSON.stringify({sentinel})+'\\n');",
    "function send(value){process.stdout.write(JSON.stringify(value)+'\\n');}",
    "const rl=readline.createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') send({jsonrpc:'2.0',id:m.id,result:{ok:true}});",
    "else if(m.method==='thread/start') send({jsonrpc:'2.0',id:m.id,result:{thread:{id:'cold-thread',ephemeral:false}}});",
    "else if(m.method==='thread/resume') send({jsonrpc:'2.0',id:m.id,result:{thread:{id:m.params.threadId,ephemeral:false}}});",
    "else if(m.method==='turn/start'){send({jsonrpc:'2.0',id:m.id,result:{turn:{id:'cold-turn'}}}); setTimeout(()=>send({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{turnId:'cold-turn',delta:'cold resume ok'}}),5); setTimeout(()=>send({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'cold-turn',status:'completed'}}}),10);}",
    "});",
  ].join('')
}

function registerSuite(): { readonly suite: ReturnType<typeof createEngineSuiteRuntime>; readonly selection: EngineSelection } {
  const suite = createEngineSuiteRuntime()
  suite.providers.register({ id: 'cold-provider', engineId: 'codex-cli', name: 'Cold Provider', baseUri: 'https://example.test', credentialRef: 'cold-credential' })
  suite.models.register({ id: 'cold-model', engineId: 'codex-cli', providerId: 'cold-provider', modelId: 'cold-model', reasoningOptions: [{ id: 'low' }], source: 'manual' })
  const selection: EngineSelection = { engineId: 'codex-cli', providerId: 'cold-provider', modelRecordId: 'cold-model', reasoningEffort: 'low' }
  suite.profiles.register({ id: 'cold-profile', selection })
  return { suite, selection }
}

async function context(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  return ctx
}

test('Codex custom executable and args survive a service cold resume', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-cold-resume-'))
  const bindings = new ExternalEngineBindingStore(join(root, 'engine-bindings.json'))
  const marker = join(root, 'launches.jsonl')
  const args = ['-e', serverScript(), marker, 'COLD_EXECUTABLE_ARGS_OK']
  const { suite, selection } = registerSuite()
  const firstContext = await context()
  const firstService = new EngineSuiteAgentService(firstContext, suite, () => 'cold-provider-secret', Promise.resolve(), bindings)
  const first = await firstService.createCodex({
    sessionId: 'cold-session',
    selection,
    apiKey: 'cold-provider-secret',
    cwd: process.cwd(),
    executable: process.execPath,
    args,
  })
  const persistedSession = first.session
  try {
    first.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'persist this turn' }], source: { kind: 'user' } }))
    await first.agent.whenIdle()
  } finally {
    await first.dispose()
  }

  const stored = await bindings.get('cold-session')
  assert.equal(stored?.executable, process.execPath)
  assert.deepEqual(stored?.args, args)
  const bindingText = await readFile(join(root, 'engine-bindings.json'), 'utf8')
  assert.doesNotMatch(bindingText, /cold-provider-secret/u)

  const secondContext = await context()
  secondContext.provide('sessionPersistence', {
    async prepare() {
      return {
        session: persistedSession,
        [Symbol.dispose](): void {},
      }
    },
  })
  const secondService = new EngineSuiteAgentService(secondContext, suite, () => 'cold-provider-secret', Promise.resolve(), bindings)
  const resumed = await secondService.resume(secondContext, { resumeSessionId: SessionId('cold-session') })
  try {
    assert.equal(resumed.session, persistedSession)
    assert.equal(resumed.selection.engineId, 'codex-cli')
    assert.equal((await readFile(marker, 'utf8')).trim().split('\n').length, 2)
    assert.match(await readFile(marker, 'utf8'), /COLD_EXECUTABLE_ARGS_OK/u)
  } finally {
    await resumed.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
