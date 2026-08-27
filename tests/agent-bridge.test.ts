import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent, type AgentHandle } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import test from 'node:test'
import { apply } from '../src/index.js'
import type { EngineSuiteRuntimeService } from '../src/plugin.js'
import { EngineSuiteChildBridge } from '../src/orchestration/bridge.js'
import { ExternalEngineBindingStore } from '../src/engine/bindings.js'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'
import { EngineSuiteAgentService, type HostAgentHandleStore } from '../src/agent/service.js'

function fakeCodexServer(): string {
  return [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'fixture-thread',ephemeral:false}}})+'\\n');",
    "else if(m.method==='thread/resume') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:m.params.threadId,ephemeral:false}}})+'\\n');",
    "else if(m.method==='turn/start'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{turn:{id:'fixture-turn'}}})+'\\n'); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{turnId:'fixture-turn',delta:'fixture answer ' + (m.params?.model ?? 'unknown')}})+'\\n'),10); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'fixture-turn',status:'completed'}}})+'\\n'),20);}",
    "});",
  ].join('')
}

function countingCodexServer(auditPath: string): string {
  return [
    "const fs=require('node:fs');",
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    `const audit=${JSON.stringify(auditPath)};`,
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize'){fs.appendFileSync(audit,'initialize\\n'); process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');}",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'counted-thread',ephemeral:false}}})+'\\n');",
    "});",
  ].join('')
}

function failingCodexServer(): string {
  return [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line); if(m.method==='initialize'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n'); setTimeout(()=>process.exit(1),5);}});",
  ].join('')
}

test('EngineSuite registers a Codex Agent that projects CLI output into a Harness Session', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  assert.ok(suite)
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
  suite.models.register({
    id: 'fixture-model-next',
    engineId: 'codex-cli',
    providerId: 'fixture-provider',
    modelId: 'gpt-fixture-next',
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
        'request/header',
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
      assert.deepEqual(assistant.data.message.content, [{ type: 'text', text: 'fixture answer gpt-fixture' }])
    }
    assert.ok(ctx.agents.get(handle.agent.id) === handle.agent)
  } finally {
    await handle.dispose()
  }
  assert.equal(ctx.agents.get(handle.agent.id), undefined)
  assert.equal(ctx.sessions.get(handle.session.id), undefined)
})


test('EngineSuite switches a blank external session from Claude/Codex profile before its first turn', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  suite.providers.register({
    id: 'switch-provider', engineId: 'codex-cli', name: 'Switch Provider',
    baseUri: 'https://example.test', credentialRef: 'switch-credential',
  })
  suite.models.register({
    id: 'switch-model-a', engineId: 'codex-cli', providerId: 'switch-provider', modelId: 'model-a',
    reasoningOptions: [{ id: 'low' }], source: 'manual',
  })
  suite.models.register({
    id: 'switch-model-b', engineId: 'codex-cli', providerId: 'switch-provider', modelId: 'model-b',
    reasoningOptions: [{ id: 'high' }], source: 'manual',
  })
  const handle = await suite.agents.createCodex({
    sessionId: 'switch-agent',
    selection: { engineId: 'codex-cli', providerId: 'switch-provider', modelRecordId: 'switch-model-a', reasoningEffort: 'low' },
    apiKey: 'switch-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', fakeCodexServer()],
  })
  try {
    await handle.updateSelection({
      engineId: 'codex-cli', providerId: 'switch-provider', modelRecordId: 'switch-model-b', reasoningEffort: 'high',
    }, 'switch-secret')
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'after switch' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    const headers = handle.session.events.filter((event: SessionEvent) => event.type === 'request/header')
    const lastHeader = headers.at(-1)
    assert.equal(lastHeader?.type, 'request/header')
    if (lastHeader?.type === 'request/header') assert.equal(lastHeader.data.header.config.model, 'model-b')
    const assistant = handle.session.events.find((event: SessionEvent) => event.type === 'assistant/message')
    assert.equal(assistant?.type, 'assistant/message')
    if (assistant?.type === 'assistant/message') {
      assert.deepEqual(assistant.data.message.content, [{ type: 'text', text: 'fixture answer model-b' }])
      assert.equal(assistant.data.message.source.model, 'model-b')
    }
  } finally {
    await handle.dispose()
  }
})

test('ExternalEngineAgent keeps deltas emitted before the CLI turn acknowledgement', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  suite.providers.register({ id: 'early-provider', engineId: 'codex-cli', name: 'Early Provider', baseUri: 'https://example.test', credentialRef: 'early-credential' })
  suite.models.register({ id: 'early-model', engineId: 'codex-cli', providerId: 'early-provider', modelId: 'early-model', reasoningOptions: [{ id: 'low' }], source: 'manual' })
  const script = [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'early-thread',ephemeral:false}}})+'\\n');",
    "else if(m.method==='turn/start'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{turnId:'early-turn',delta:'early-'}})+'\\n'); process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{turn:{id:'early-turn'}}})+'\\n'); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{turnId:'early-turn',delta:'delta'}})+'\\n'),5); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'early-turn',status:'completed'}}})+'\\n'),15);}",
    "});",
  ].join('')
  const handle = await suite.agents.createCodex({
    sessionId: 'early-agent',
    selection: { engineId: 'codex-cli', providerId: 'early-provider', modelRecordId: 'early-model', reasoningEffort: 'low' },
    apiKey: 'early-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', script],
  })
  try {
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'stream now' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    const assistant = handle.session.events.find((event: SessionEvent) => event.type === 'assistant/message')
    assert.equal(assistant?.type, 'assistant/message')
    if (assistant?.type === 'assistant/message') assert.deepEqual(assistant.data.message.content, [{ type: 'text', text: 'early-delta' }])
    assert.equal(handle.session.events.filter((event: SessionEvent) => event.type === 'assistant/chunk').length, 2)
  } finally {
    await handle.dispose()
  }
})

test('EngineSuite projects Codex command items into Harness tool call/result events', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  suite.providers.register({
    id: 'tool-provider', engineId: 'codex-cli', name: 'Tool Provider',
    baseUri: 'https://example.test', credentialRef: 'tool-credential',
  })
  suite.models.register({
    id: 'tool-model', engineId: 'codex-cli', providerId: 'tool-provider', modelId: 'tool-model',
    reasoningOptions: [{ id: 'low' }], source: 'manual',
  })
  const script = [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'tool-thread',ephemeral:false}}})+'\\n');",
    "else if(m.method==='turn/start'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{turn:{id:'tool-turn'}}})+'\\n'); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'item/started',params:{turnId:'tool-turn',item:{id:'tool-1',type:'commandExecution',command:'echo tool',status:'inProgress'}}})+'\\n'),10); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'item/completed',params:{turnId:'tool-turn',item:{id:'tool-1',type:'commandExecution',command:'echo tool',aggregatedOutput:'tool output',status:'completed'}}})+'\\n'),20); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'tool-turn',status:'completed'}}})+'\\n'),30);}",
    "});",
  ].join('')
  const handle = await suite.agents.createCodex({
    sessionId: 'tool-agent',
    selection: { engineId: 'codex-cli', providerId: 'tool-provider', modelRecordId: 'tool-model', reasoningEffort: 'low' },
    apiKey: 'tool-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', script],
  })
  try {
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'run tool' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    const types = handle.session.events.map((event: SessionEvent) => event.type)
    assert.ok(types.includes('tool/call'))
    assert.ok(types.includes('tool/result'))
    const result = handle.session.events.find((event: SessionEvent) => event.type === 'tool/result')
    assert.equal(result?.type, 'tool/result')
    if (result?.type === 'tool/result') {
      assert.deepEqual(result.data.message.content, [{ type: 'tool-result', toolCallId: 'tool-1', content: [{ type: 'text', text: 'tool output' }], isError: false }])
    }
  } finally {
    await handle.dispose()
  }
})


test('EngineSuite delegates an authorized child Agent across Engine Profiles with parent session lineage', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  suite.providers.register({
    id: 'parent-provider', engineId: 'codex-cli', name: 'Parent Provider',
    baseUri: 'https://example.test', credentialRef: 'parent-credential',
  })
  suite.providers.register({
    id: 'child-provider', engineId: 'codex-cli', name: 'Child Provider',
    baseUri: 'https://example.test', credentialRef: 'child-credential',
  })
  suite.models.register({
    id: 'parent-model', engineId: 'codex-cli', providerId: 'parent-provider', modelId: 'parent-model',
    reasoningOptions: [{ id: 'low' }], source: 'manual',
  })
  suite.models.register({
    id: 'child-model', engineId: 'codex-cli', providerId: 'child-provider', modelId: 'child-model',
    reasoningOptions: [{ id: 'low' }], source: 'manual',
  })
  suite.profiles.register({
    id: 'parent-profile',
    selection: { engineId: 'codex-cli', providerId: 'parent-provider', modelRecordId: 'parent-model', reasoningEffort: 'low' },
    allowedChildProfiles: ['child-profile'],
    maxChildDepth: 1,
    maxConcurrentChildren: 1,
  })
  suite.profiles.register({
    id: 'child-profile',
    selection: { engineId: 'codex-cli', providerId: 'child-provider', modelRecordId: 'child-model', reasoningEffort: 'low' },
  })
  const parent = await suite.agents.createCodex({
    sessionId: 'parent-agent',
    selection: { engineId: 'codex-cli', providerId: 'parent-provider', modelRecordId: 'parent-model', reasoningEffort: 'low' },
    apiKey: 'parent-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', fakeCodexServer()],
  })
  try {
    const result = await suite.agents.delegate('parent-agent', { profileId: 'child-profile', task: 'child task', apiKey: 'child-secret', executable: process.execPath, args: ['-e', fakeCodexServer()] })
    assert.equal(result.handle.parentSessionId, 'parent-agent')
    assert.equal(result.handle.nativeTaskId, result.lineage.nativeTaskId)
    assert.equal(result.handle.delegationDepth, 1)
    assert.match(result.text, /fixture answer child-model/)
    assert.equal(result.handle.session.header.parentSession, 'parent-agent')
    assert.equal(result.handle.session.header.origin, 'subagent')
    assert.equal(result.handle.session.header.delegationDepth, 1)
    assert.ok(result.handle.session.events.some(event => event.type === 'assistant/message'))
    await assert.rejects(
      suite.agents.delegate('parent-agent', { profileId: 'child-profile', task: 'second child', apiKey: 'child-secret', executable: process.execPath, args: ['-e', fakeCodexServer()] }),
      /concurrency limit/,
    )
    await result.handle.dispose()
  } finally {
    await parent.dispose()
  }
})

test('EngineSuite serializes concurrent external creation for one Session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-create-'))
  const auditPath = join(root, 'launches.log')
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  suite.providers.register({ id: 'duplicate-provider', engineId: 'codex-cli', name: 'Duplicate Provider', baseUri: 'https://example.test', credentialRef: 'duplicate-credential' })
  suite.models.register({ id: 'duplicate-model', engineId: 'codex-cli', providerId: 'duplicate-provider', modelId: 'duplicate-model', reasoningOptions: [{ id: 'xhigh' }], source: 'manual' })
  const options = {
    sessionId: 'duplicate-session',
    selection: { engineId: 'codex-cli', providerId: 'duplicate-provider', modelRecordId: 'duplicate-model', reasoningEffort: 'xhigh' },
    apiKey: 'duplicate-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', countingCodexServer(auditPath)],
  } as const
  const [first, second] = await Promise.all([suite.agents.createExternal(options), suite.agents.createExternal(options)])
  try {
    assert.equal(first, second)
    assert.equal(first.selection.engineId, 'codex-cli')
    assert.equal(first.selection.providerId, 'duplicate-provider')
    assert.equal(first.selection.modelRecordId, 'duplicate-model')
    assert.equal(first.selection.reasoningEffort, 'xhigh')
    const header = first.session.requestHeader()
    assert.equal(header?.config.provider, 'duplicate-provider')
    assert.equal(header?.config.model, 'duplicate-model')
    assert.equal(header?.config.reasoningEffort, 'xhigh')
    assert.equal(suite.agents.list().length, 1)
    assert.equal((await readFile(auditPath, 'utf8')).trim().split('\n').filter(Boolean).length, 1)
  } finally {
    await first.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('failed external startup leaves no Session, Agent, Engine handle, or binding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-startup-failure-'))
  const bindingFile = join(root, 'engine-bindings.json')
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const suite = createEngineSuiteRuntime()
  suite.providers.register({ id: 'failure-provider', engineId: 'codex-cli', name: 'Failure Provider', baseUri: 'https://example.test', credentialRef: 'failure-credential' })
  suite.models.register({ id: 'failure-model', engineId: 'codex-cli', providerId: 'failure-provider', modelId: 'failure-model', reasoningOptions: [{ id: 'low' }], source: 'manual' })
  const service = new EngineSuiteAgentService(ctx, suite, () => 'failure-secret', new ExternalEngineBindingStore(bindingFile))
  try {
    await assert.rejects(service.createExternal({
      sessionId: 'startup-failure',
      selection: { engineId: 'codex-cli', providerId: 'failure-provider', modelRecordId: 'failure-model', reasoningEffort: 'low' },
      apiKey: 'failure-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', failingCodexServer()], startupTimeoutMs: 100,
    }), /closed|exit|failed|startup/u)
    assert.equal(service.list().length, 0)
    assert.equal(ctx.agents.get(SessionId('startup-failure')), undefined)
    assert.equal(ctx.sessions.get(SessionId('startup-failure')), undefined)
    assert.equal(await new ExternalEngineBindingStore(bindingFile).get('startup-failure'), undefined)
    await assert.rejects(readFile(bindingFile), { code: 'ENOENT' })
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('external publication failure after workspace attach rolls back every owned resource', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-attach-failure-'))
  const bindingFile = join(root, 'engine-bindings.json')
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  ctx.provide('workspaceRegistry', {
    list: () => [{
      path: process.cwd(),
      attachSession: async () => { throw new Error('workspace attach failed') },
    }],
  } as never)
  const suite = createEngineSuiteRuntime()
  suite.providers.register({ id: 'attach-failure-provider', engineId: 'codex-cli', name: 'Attach Failure Provider', baseUri: 'https://example.test', credentialRef: 'attach-failure-credential' })
  suite.models.register({ id: 'attach-failure-model', engineId: 'codex-cli', providerId: 'attach-failure-provider', modelId: 'attach-failure-model', reasoningOptions: [{ id: 'low' }], source: 'manual' })
  const service = new EngineSuiteAgentService(ctx, suite, () => 'attach-failure-secret', new ExternalEngineBindingStore(bindingFile))
  try {
    await assert.rejects(service.createExternal({
      sessionId: 'attach-failure',
      selection: { engineId: 'codex-cli', providerId: 'attach-failure-provider', modelRecordId: 'attach-failure-model', reasoningEffort: 'low' },
      apiKey: 'attach-failure-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', fakeCodexServer()],
    }), /workspace attach failed/u)
    assert.equal(service.list().length, 0)
    assert.equal(ctx.agents.get(SessionId('attach-failure')), undefined)
    assert.equal(ctx.sessions.get(SessionId('attach-failure')), undefined)
    assert.equal(await new ExternalEngineBindingStore(bindingFile).get('attach-failure'), undefined)
    await assert.rejects(readFile(bindingFile), { code: 'ENOENT' })
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('external selection promotes a blank Host-native Agent without duplicating its Session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-promotion-'))
  const bindingFile = join(root, 'engine-bindings.json')
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const sessions = ctx.get('sessions')
  const agents = ctx.get('agents')
  assert.ok(sessions !== undefined)
  assert.ok(agents !== undefined)
  const sessionId = SessionId('native-promotion')
  const session = sessions.prepare(sessionId, { meta: { cwd: process.cwd() } })
  const nativeAgent = { id: sessionId, session } as Agent
  const detachSession = sessions.enter(session)
  sessions.announce(session)
  const detachAgent = agents.enter(nativeAgent, undefined)
  agents.announce(nativeAgent)
  let nativeDisposed = false
  const nativeHandle: AgentHandle = {
    agent: nativeAgent,
    dispose: async () => {
      nativeDisposed = true
      detachAgent()
      detachSession()
    },
  }
  const hostAgentHandles: HostAgentHandleStore = {
    wait: async (id, agent) => id === String(sessionId) && agent === nativeAgent ? nativeHandle : undefined,
    take: (id, agent) => id === String(sessionId) && agent === nativeAgent ? nativeHandle : undefined,
  }
  const suite = createEngineSuiteRuntime()
  suite.providers.register({ id: 'promotion-provider', engineId: 'codex-cli', name: 'Promotion Provider', baseUri: 'https://example.test', credentialRef: 'promotion-credential' })
  suite.models.register({ id: 'promotion-model', engineId: 'codex-cli', providerId: 'promotion-provider', modelId: 'promotion-model', reasoningOptions: [{ id: 'xhigh' }], source: 'manual' })
  const service = new EngineSuiteAgentService(ctx, suite, () => 'promotion-secret', new ExternalEngineBindingStore(bindingFile), undefined, hostAgentHandles)
  try {
    const promoted = await service.createExternal({
      sessionId: String(sessionId),
      selection: { engineId: 'codex-cli', providerId: 'promotion-provider', modelRecordId: 'promotion-model', reasoningEffort: 'xhigh' },
      apiKey: 'promotion-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', fakeCodexServer()],
    })
    try {
      assert.equal(nativeDisposed, true)
      assert.equal(promoted.session, session)
      assert.equal(ctx.sessions.get(sessionId), session)
      assert.equal(ctx.agents.get(sessionId), promoted.agent)
      assert.equal(service.list().length, 1)
    } finally {
      await promoted.dispose()
    }
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('EngineSuite attaches the selected CLI to an existing blank Harness Session instead of creating a duplicate', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  suite.providers.register({ id: 'blank-provider', engineId: 'codex-cli', name: 'Blank Provider', baseUri: 'https://example.test', credentialRef: 'blank-credential' })
  suite.models.register({ id: 'blank-model', engineId: 'codex-cli', providerId: 'blank-provider', modelId: 'blank-model', reasoningOptions: [{ id: 'low' }], source: 'manual' })
  const sessions = ctx.get('sessions')
  const agents = ctx.get('agents')
  assert.ok(sessions !== undefined)
  assert.ok(agents !== undefined)
  const existing = sessions.create(SessionId('blank-existing'), { meta: { cwd: process.cwd() } })
  const handle = await suite.agents.createExternal({
    sessionId: 'blank-existing',
    selection: { engineId: 'codex-cli', providerId: 'blank-provider', modelRecordId: 'blank-model', reasoningEffort: 'low' },
    apiKey: 'blank-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', fakeCodexServer()],
  })
  try {
    assert.equal(handle.session, existing)
    assert.equal(sessions.get(existing.id), existing)
    assert.equal(agents.get(existing.id), handle.agent)
  } finally {
    await handle.dispose()
  }
})

test('EngineSuite keeps Engine locked after conversation but resumes the same CLI for model/reasoning changes', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)
  const suite = ctx.get('engineSuite') as EngineSuiteRuntimeService
  suite.providers.register({ id: 'locked-provider', engineId: 'codex-cli', name: 'Locked Provider', baseUri: 'https://example.test', credentialRef: 'locked-credential' })
  suite.models.register({ id: 'locked-model-a', engineId: 'codex-cli', providerId: 'locked-provider', modelId: 'model-a', reasoningOptions: [{ id: 'low' }], source: 'manual' })
  suite.models.register({ id: 'locked-model-b', engineId: 'codex-cli', providerId: 'locked-provider', modelId: 'model-b', reasoningOptions: [{ id: 'high' }], source: 'manual' })
  const handle = await suite.agents.createCodex({
    sessionId: 'locked-agent',
    selection: { engineId: 'codex-cli', providerId: 'locked-provider', modelRecordId: 'locked-model-a', reasoningEffort: 'low' },
    apiKey: 'locked-secret', cwd: process.cwd(), executable: process.execPath, args: ['-e', fakeCodexServer()],
  })
  try {
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'first turn' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    await handle.updateSelection({
      engineId: 'codex-cli', providerId: 'locked-provider', modelRecordId: 'locked-model-b', reasoningEffort: 'high',
    }, 'locked-secret')
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'second turn' }], source: { kind: 'user' } }))
    await handle.agent.whenIdle()
    const lastHeader = handle.session.events.filter((event: SessionEvent) => event.type === 'request/header').at(-1)
    assert.equal(lastHeader?.type, 'request/header')
    if (lastHeader?.type === 'request/header') assert.equal(lastHeader.data.header.config.model, 'model-b')
    await assert.rejects(
      handle.updateSelection({ engineId: 'claude-cli', providerId: 'other', modelRecordId: 'other', reasoningEffort: 'max' }, 'locked-secret'),
      /Engine selection is locked after the first turn/,
    )
  } finally {
    await handle.dispose()
  }
})


test('child delegation bridge binds the parent source and rejects credentials or unknown fields', async () => {
  const received: unknown[] = []
  const bridge = new EngineSuiteChildBridge(async request => {
    received.push(request)
    return { childSessionId: 'child-secure', text: 'ok', ...request.nativeTaskId === undefined ? {} : { nativeTaskId: request.nativeTaskId } }
  })
  await bridge.start()
  try {
    const launch = bridge.launchFor('parent-secure')
    assert.equal('OPENAI_API_KEY' in launch.environment, false)
    assert.equal(Object.keys(launch.environment).some(key => /key|token|credential/iu.test(key) && key !== 'DSH_ENGINE_SUITE_BRIDGE_TOKEN'), false)
    const rejectedParent = await fetch(`${launch.serverUrl}/delegate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-engine-suite-token': launch.token },
      body: JSON.stringify({ parentSessionId: 'other-parent', profileId: 'child', task: 'run' }),
    })
    assert.equal(rejectedParent.status, 400)
    const rejectedCredential = await fetch(`${launch.serverUrl}/delegate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-engine-suite-token': launch.token },
      body: JSON.stringify({ parentSessionId: 'parent-secure', profileId: 'child', task: 'run', apiKey: 'must-not-cross' }),
    })
    assert.equal(rejectedCredential.status, 400)
    const accepted = await fetch(`${launch.serverUrl}/delegate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-engine-suite-token': launch.token },
      body: JSON.stringify({ parentSessionId: 'parent-secure', profileId: 'child', task: 'run', nativeTaskId: 'trace-1' }),
    })
    assert.equal(accepted.status, 200)
    assert.deepEqual(await accepted.json(), { ok: true, value: { childSessionId: 'child-secure', text: 'ok', nativeTaskId: 'trace-1' } })
    assert.deepEqual(received, [{ parentSessionId: 'parent-secure', profileId: 'child', task: 'run', nativeTaskId: 'trace-1' }])
    bridge.release('parent-secure')
    const released = await fetch(`${launch.serverUrl}/delegate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-engine-suite-token': launch.token },
      body: JSON.stringify({ parentSessionId: 'parent-secure', profileId: 'child', task: 'run' }),
    })
    assert.equal(released.status, 400)
  } finally {
    await bridge.close()
  }
})
