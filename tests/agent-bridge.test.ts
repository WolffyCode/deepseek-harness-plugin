import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { type SessionEvent } from '@deepseek-ai/dsh-session'
import test from 'node:test'
import { apply } from '../src/index.js'

function fakeCodexServer(): string {
  return [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'fixture-thread',ephemeral:false}}})+'\\n');",
    "else if(m.method==='turn/start'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{turn:{id:'fixture-turn'}}})+'\\n'); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{turnId:'fixture-turn',delta:'fixture answer'}})+'\\n'),10); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'fixture-turn',status:'completed'}}})+'\\n'),20);}",
    "});",
  ].join('')
}

test('EngineSuite registers a Codex Agent that projects CLI output into a Harness Session', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite')
  suite.providers.register({
    id: 'fixture-provider',
    engineId: 'codex-cli',
    name: 'Fixture Provider',
    baseUri: 'https://example.test',
    credentialRef: 'fixture-credential',
  })
  suite.models.register({
    id: 'fixture-model',
    engineId: 'codex-cli',
    providerId: 'fixture-provider',
    modelId: 'gpt-fixture',
    reasoningOptions: [{ id: 'high' }],
    source: 'manual',
  })

  const handle = await suite.agents.createCodex({
    sessionId: 'fixture-agent',
    selection: {
      engineId: 'codex-cli',
      providerId: 'fixture-provider',
      modelRecordId: 'fixture-model',
      reasoningEffort: 'high',
    },
    apiKey: 'fixture-secret',
    cwd: process.cwd(),
    executable: process.execPath,
    args: ['-e', fakeCodexServer()],
  })
  try {
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'fixture task' }],
      source: { kind: 'user' },
    }))
    await handle.agent.whenIdle()

    assert.equal(handle.agent.status, 'idle')
    assert.deepEqual(
      handle.session.events.map((event: SessionEvent) => event.type),
      [
        'agent/inbox/spliced',
        'agent/inbox/spliced',
        'turn/start',
        'step/start',
        'user/message',
        'assistant/chunk',
        'assistant/message',
        'step/end',
        'turn/end',
      ],
    )
    const assistant = handle.session.events.find((event: SessionEvent) => event.type === 'assistant/message')
    assert.equal(assistant?.type, 'assistant/message')
    if (assistant?.type === 'assistant/message') {
      assert.deepEqual(assistant.data.message.content, [{ type: 'text', text: 'fixture answer' }])
    }
    assert.ok(ctx.agents.get(handle.agent.id) === handle.agent)
  } finally {
    await handle.dispose()
  }
  assert.equal(ctx.agents.get(handle.agent.id), undefined)
  assert.equal(ctx.sessions.get(handle.session.id), undefined)
})
