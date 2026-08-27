import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { PassThrough } from 'node:stream'
import { normalizeExternalEngineEvent } from '../src/agent/runtime.js'
import { JsonRpcLineTransport } from '../src/codex/json-rpc.js'
import { CodexRuntime } from '../src/codex/runtime.js'

async function nextLine(stream: PassThrough): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk: Buffer | string): void => {
      buffer += String(chunk)
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      stream.off('data', onData)
      try {
        resolve(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>)
      } catch (error: unknown) {
        reject(error)
      }
    }
    const onError = (error: Error): void => {
      stream.off('data', onData)
      reject(error)
    }
    stream.on('data', onData)
    stream.once('error', onError)
  })
}

test('JSON-RPC transport matches responses and dispatches server requests', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const transport = new JsonRpcLineTransport(input, output)
  transport.start()
  transport.onRequest((method, params) => ({ method, params: params ?? null }))

  const pending = transport.request<{ ok: boolean }>('ping', { value: 1 })
  const request = await nextLine(output)
  assert.equal(request['method'], 'ping')
  input.write(JSON.stringify({ jsonrpc: '2.0', id: request['id'], result: { ok: true } }) + '\n')
  assert.deepEqual(await pending, { ok: true })

  const serverRequest = transport.request('server-test')
  const serverCall = await nextLine(output)
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'approval', params: { allow: true } }) + '\n')
  const serverResponse = await nextLine(output)
  assert.equal(serverResponse['id'], 99)
  assert.deepEqual(serverResponse['result'], { method: 'approval', params: { allow: true } })
  input.write(JSON.stringify({ jsonrpc: '2.0', id: serverCall['id'], result: null }) + '\n')
  await serverRequest
  transport.close()
})

test('CodexRuntime performs initialize, thread/start, turn/start and close', async () => {
  const script = [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'thread-1',ephemeral:false}}})+'\\n');",
    "else if(m.method==='turn/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{turn:{id:'turn-1'}}})+'\\n');",
    "else if(m.method==='turn/interrupt') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{status:'interrupted'}})+'\\n');",
    "else if(m.method==='thread/resume') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:m.params.threadId,ephemeral:false}}})+'\\n');",
    "});",
  ].join('')
  const runtime = await CodexRuntime.open({
    executable: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    disposeGraceMs: 100,
  })
  const thread = await runtime.startThread()
  assert.equal(thread.id, 'thread-1')
  const turn = await runtime.startTurn('hello')
  assert.equal(turn.id, 'turn-1')
  const interrupted = await runtime.interrupt()
  assert.deepEqual(interrupted, { status: 'interrupted' })
  const exit = await runtime.close()
  assert.equal(exit.signal, null)
})

test('CodexRuntime resolves turn start from the first live turn event', async () => {
  const script = [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'thread-live',ephemeral:false}}})+'\\n');",
    "else if(m.method==='turn/start'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'turn/started',params:{turn:{id:'turn-live',status:'inProgress'}}})+'\\n'); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{turnId:'turn-live',delta:'live'}})+'\\n'),5); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'turn-live',status:'completed'}}})+'\\n'),15); setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{turn:{id:'turn-live'}}})+'\\n'),250);}",
    "});",
  ].join('')
  const runtime = await CodexRuntime.open({
    executable: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    disposeGraceMs: 100,
  })
  const events: unknown[] = []
  let resolveComplete!: () => void
  const complete = new Promise<void>(resolve => { resolveComplete = resolve })
  const off = runtime.onEvent(event => {
    events.push(event)
    if (typeof event === 'object' && event !== null && (event as { type?: string }).type === 'turn_completed') resolveComplete()
  })
  try {
    await runtime.startThread()
    const start = runtime.startTurn('live now')
    const turn = await Promise.race([
      start,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('turn start did not resolve from live event')), 100)),
    ])
    assert.equal(turn.id, 'turn-live')
    await Promise.race([
      complete,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('turn did not complete')), 100)),
    ])
    assert.deepEqual(events.filter(event => typeof event === 'object' && event !== null && (event as { type?: string }).type === 'turn_started').length, 1)
    assert.equal(events.some(event => typeof event === 'object' && event !== null && (event as { type?: string }).type === 'turn_completed'), true)
  } finally {
    off()
    await runtime.close()
  }
})

test('CodexRuntime bounds startup and cleans the child process on timeout', async () => {
  const script = [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',()=>{});",
    "setInterval(()=>{},1000);",
  ].join('')
  await assert.rejects(CodexRuntime.open({
    executable: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    startupTimeoutMs: 25,
    disposeGraceMs: 10,
  }), /Codex startup timed out after 25ms/u)
})

test('Codex config materialization keeps the API key out of config.toml', async () => {
  const { renderCodexConfig } = await import('../src/codex/config.js')
  const materialized = renderCodexConfig({
    providerName: 'Debug Relay / Codex',
    baseUri: 'https://example.test/',
    model: 'gpt-test',
    apiKey: 'secret-api-key',
  })
  assert.match(materialized.configToml, /model_provider = "Debug_Relay___Codex"/)
  assert.match(materialized.configToml, /wire_api = "responses"/)
  assert.doesNotMatch(materialized.configToml, /secret-api-key/)
  assert.equal(materialized.environment['OPENAI_API_KEY'], 'secret-api-key')
  assert.deepEqual(materialized.redactions, ['secret-api-key'])
})

test('EngineSuite opens an isolated Codex launch from a resolved profile', async () => {
  const { createEngineSuiteRuntime } = await import('../src/engine-suite.js')
  const suite = createEngineSuiteRuntime()
  suite.providers.register({
    id: 'launch-provider',
    engineId: 'codex-cli',
    name: 'Launch Provider',
    baseUri: 'https://example.test',
    credentialRef: 'launch-credential',
  })
  suite.models.register({
    id: 'launch-model',
    engineId: 'codex-cli',
    providerId: 'launch-provider',
    modelId: 'gpt-test',
    reasoningOptions: [{ id: 'high' }],
    source: 'manual',
  })
  const script = [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='thread/start') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{thread:{id:'launch-thread',ephemeral:false}}})+'\\n');",
    "});",
  ].join('')
  const launch = await suite.openCodex({
    engineId: 'codex-cli',
    providerId: 'launch-provider',
    modelRecordId: 'launch-model',
    reasoningEffort: 'high',
  }, {
    apiKey: 'launch-secret',
    cwd: process.cwd(),
    executable: process.execPath,
    args: ['-e', script],
    disposeGraceMs: 100,
  })
  assert.equal(launch.runtime.threadId, 'launch-thread')
  assert.equal(launch.profile.reasoningEffort, 'high')
  assert.match(launch.codexHome, /codex-home$/)
  await launch.close()
})

test('Codex model discovery normalizes model and reasoning metadata', async () => {
  const { discoverCodexModels } = await import('../src/codex/discovery.js')
  const script = [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');",
    "else if(m.method==='model/list') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{data:[{id:'model-one',model:'model-one',displayName:'Model One',description:'fixture',hidden:true,isDefault:true,defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'low',description:'low'},{reasoningEffort:'high',description:'high'}]}],nextCursor:null}})+'\\n');",
    "});",
  ].join('')
  const models = await discoverCodexModels({
    provider: {
      id: 'discovery-provider',
      engineId: 'codex-cli',
      name: 'Discovery Provider',
      baseUri: 'https://example.test',
      credentialRef: 'discovery-credential',
      wireApi: 'responses',
      authMode: 'api-key',
      enabled: true,
      status: 'unknown',
    },
    apiKey: 'discovery-secret',
    cwd: process.cwd(),
    executable: process.execPath,
    args: ['-e', script],
  })
  assert.equal(models.length, 1)
  assert.equal(models[0]?.modelId, 'model-one')
  assert.deepEqual(models[0]?.reasoningOptions, [
    { id: 'low', description: 'low' },
    { id: 'high', description: 'high' },
  ])
  assert.equal(models[0]?.defaultReasoningEffort, 'high')
  assert.equal(models[0]?.source, 'discovered')
  assert.equal(models[0]?.hidden, true)
})

type RuntimeTestEvent = Record<string, unknown>

type RuntimeNotification = {
  readonly method: string
  readonly params: Record<string, unknown>
}

function notificationFixtureScript(notifications: readonly RuntimeNotification[]): string {
  const encoded = JSON.stringify(notifications)
  return [
    "const rl=require('node:readline').createInterface({input:process.stdin});",
    "const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');",
    `const notifications=${encoded};`,
    "rl.on('line',line=>{const m=JSON.parse(line);",
    "if(m.method==='initialize') send({jsonrpc:'2.0',id:m.id,result:{ok:true}});",
    "else if(m.method==='thread/start') send({jsonrpc:'2.0',id:m.id,result:{thread:{id:'c1-thread',ephemeral:false}}});",
    "else if(m.method==='turn/start'){send({jsonrpc:'2.0',id:m.id,result:{turn:{id:'c1-turn'}}});setTimeout(()=>notifications.forEach(n=>send({jsonrpc:'2.0',method:n.method,params:n.params})),5);}",
    "});",
  ].join('')
}

async function collectRuntimeNotifications(notifications: readonly RuntimeNotification[]): Promise<readonly RuntimeTestEvent[]> {
  const runtime = await CodexRuntime.open({
    executable: process.execPath,
    args: ['-e', notificationFixtureScript(notifications)],
    cwd: process.cwd(),
    disposeGraceMs: 100,
  })
  const events: RuntimeTestEvent[] = []
  let resolveTerminal: (() => void) | undefined
  const terminal = new Promise<void>(resolve => { resolveTerminal = resolve })
  const off = runtime.onEvent(event => {
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return
    const record = event as RuntimeTestEvent
    events.push(record)
    if (record['type'] === 'turn_completed' || record['type'] === 'turn_failed' || record['type'] === 'turn_canceled') resolveTerminal?.()
  })
  try {
    await runtime.startThread()
    await runtime.startTurn('c1 fixture')
    await Promise.race([
      terminal,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out waiting for turn completion')), 1000)),
    ])
    return events
  } finally {
    off()
    await runtime.close()
  }
}

function eventWithType(events: readonly RuntimeTestEvent[], type: string): RuntimeTestEvent {
  const event = events.find(candidate => candidate['type'] === type)
  assert.ok(event, `expected event type ${type}`)
  return event
}

test('CodexRuntime projects C1 V2 item, reasoning, tool, usage, turn, and unknown notifications', async () => {
  const events = await collectRuntimeNotifications([
    { method: 'turn/started', params: { threadId: 'c1-thread', turn: { id: 'c1-turn', status: 'inProgress' } } },
    { method: 'item/agentMessage/delta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'agent-1', delta: 'assistant delta' } },
    { method: 'item/reasoning/textDelta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'reasoning-1', contentIndex: 2, delta: 'reasoning text' } },
    { method: 'item/reasoning/summaryTextDelta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'reasoning-1', summaryIndex: 4, delta: 'reasoning summary' } },
    { method: 'item/started', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'command-1', type: 'commandExecution', command: 'printf command', status: 'inProgress' } } },
    { method: 'item/commandExecution/outputDelta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'command-1', delta: 'command output' } },
    { method: 'item/completed', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'command-1', type: 'commandExecution', command: 'printf command', aggregatedOutput: 'command result', status: 'completed' } } },
    { method: 'item/started', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'file-1', type: 'fileChange', changes: [{ path: 'a.txt', kind: 'update' }], status: 'inProgress' } } },
    { method: 'item/fileChange/outputDelta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'file-1', delta: 'file output' } },
    { method: 'item/fileChange/patchUpdated', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'file-1', changes: [{ path: 'a.txt', kind: 'update' }], patch: '@@ -1 +1 @@' } },
    { method: 'item/completed', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'file-1', type: 'fileChange', changes: [{ path: 'a.txt', kind: 'update' }], status: 'completed' } } },
    { method: 'item/started', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'mcp-1', type: 'mcpToolCall', server: 'fixture', tool: 'lookup', arguments: { key: 'value' }, status: 'inProgress' } } },
    { method: 'item/mcpToolCall/progress', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'mcp-1', progress: { message: 'working', percent: 50 } } },
    { method: 'item/completed', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'mcp-1', type: 'mcpToolCall', server: 'fixture', tool: 'lookup', arguments: { key: 'value' }, result: { value: 42 }, status: 'completed' } } },
    { method: 'thread/tokenUsage/updated', params: { threadId: 'c1-thread', turnId: 'c1-turn', tokenUsage: { total: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, last: { inputTokens: 4, outputTokens: 2, totalTokens: 6 }, modelContextWindow: 128000 } } },
    { method: 'thread/fixtureUnknown', params: { threadId: 'c1-thread', value: 'preserve boundary' } },
    { method: 'turn/completed', params: { threadId: 'c1-thread', turn: { id: 'c1-turn', status: 'failed', error: { message: 'turn failed', additionalDetails: 'details', codexErrorInfo: { code: 'fixture_error' } } } } },
  ])

  const delta = eventWithType(events, 'text-delta')
  assert.equal(delta['turnId'], 'c1-turn')
  assert.equal(delta['itemId'], 'agent-1')
  assert.equal(delta['text'], 'assistant delta')

  const reasoning = events.find(event => event['type'] === 'reasoning' && event['stream'] === 'text')
  assert.ok(reasoning)
  assert.equal(reasoning['turnId'], 'c1-turn')
  assert.equal(reasoning['itemId'], 'reasoning-1')
  assert.equal(reasoning['contentIndex'], 2)
  assert.equal(reasoning['text'], 'reasoning text')
  const summary = events.find(event => event['type'] === 'reasoning' && event['stream'] === 'summary')
  assert.ok(summary)
  assert.equal(summary['summaryIndex'], 4)
  assert.equal(summary['text'], 'reasoning summary')

  const commandCall = events.find(event => event['type'] === 'tool-call' && event['itemType'] === 'commandExecution')
  assert.ok(commandCall)
  assert.equal(commandCall['id'], 'command-1')
  assert.equal(commandCall['status'], 'inProgress')
  const commandOutput = events.find(event => event['type'] === 'tool-output-delta' && event['itemType'] === 'commandExecution')
  assert.ok(commandOutput)
  assert.equal(commandOutput['itemId'], 'command-1')
  assert.equal(commandOutput['delta'], 'command output')
  const commandResult = events.find(event => event['type'] === 'tool-result' && event['itemType'] === 'commandExecution')
  assert.ok(commandResult)
  assert.equal(commandResult['output'], 'command result')
  assert.equal(commandResult['isError'], false)

  const fileCall = events.find(event => event['type'] === 'tool-call' && event['itemType'] === 'fileChange')
  assert.ok(fileCall)
  assert.equal(fileCall['id'], 'file-1')
  const fileOutput = events.find(event => event['type'] === 'tool-output-delta' && event['itemType'] === 'fileChange')
  assert.ok(fileOutput)
  assert.equal(fileOutput['delta'], 'file output')
  const filePatch = eventWithType(events, 'file-change')
  assert.deepEqual(filePatch['changes'], [{ path: 'a.txt', kind: 'update' }])
  assert.equal(filePatch['patch'], '@@ -1 +1 @@')
  const fileResult = events.find(event => event['type'] === 'tool-result' && event['itemType'] === 'fileChange')
  assert.ok(fileResult)
  assert.equal(fileResult['isError'], false)

  const mcpCall = events.find(event => event['type'] === 'tool-call' && event['itemType'] === 'mcpToolCall')
  assert.ok(mcpCall)
  assert.equal(mcpCall['id'], 'mcp-1')
  assert.equal(mcpCall['name'], 'lookup')
  const mcpProgress = eventWithType(events, 'mcp-progress')
  assert.deepEqual(mcpProgress['progress'], { message: 'working', percent: 50 })
  const mcpResult = events.find(event => event['type'] === 'tool-result' && event['itemType'] === 'mcpToolCall')
  assert.ok(mcpResult)
  assert.equal(mcpResult['isError'], false)
  assert.equal(mcpResult['output'], JSON.stringify({ value: 42 }))

  const usage = eventWithType(events, 'usage_updated')
  assert.ok(normalizeExternalEngineEvent(delta, 'codex-cli'))
  assert.ok(normalizeExternalEngineEvent(reasoning, 'codex-cli'))
  assert.ok(normalizeExternalEngineEvent(commandCall, 'codex-cli'))
  assert.ok(normalizeExternalEngineEvent(commandResult, 'codex-cli'))
  assert.ok(normalizeExternalEngineEvent(usage, 'codex-cli'))
  assert.deepEqual(usage['tokenUsage'], {
    total: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    last: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
    modelContextWindow: 128000,
  })
  const started = eventWithType(events, 'turn_started')
  assert.equal(started['status'], 'inProgress')
  const completed = eventWithType(events, 'turn_failed')
  assert.equal(completed['error'], 'turn failed')
  assert.deepEqual(completed['errorDetails'], { message: 'turn failed', additionalDetails: 'details', codexErrorInfo: { code: 'fixture_error' } })
  assert.ok(normalizeExternalEngineEvent(completed, 'codex-cli'))

  const unknown = events.find(event => event['type'] === 'unknown-notification')
  assert.ok(unknown)
  assert.equal(unknown['method'], 'thread/fixtureUnknown')
})

test('CodexRuntime keeps failed tool results and terminal turns monotonic', async () => {
  const events = await collectRuntimeNotifications([
    { method: 'turn/started', params: { threadId: 'c1-thread', turn: { id: 'c1-turn', status: 'inProgress' } } },
    { method: 'item/started', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'failed-command', type: 'commandExecution', command: 'false', status: 'inProgress' } } },
    { method: 'item/completed', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'failed-command', type: 'commandExecution', command: 'false', status: 'failed', error: { message: 'exit status 1' }, stderr: 'stderr output' } } },
    { method: 'turn/completed', params: { threadId: 'c1-thread', turn: { id: 'c1-turn', status: 'failed', error: { message: 'terminal failure', additionalDetails: 'diagnostic', codexErrorInfo: { code: 'turn_failed' } } } } },
    { method: 'turn/completed', params: { threadId: 'c1-thread', turn: { id: 'c1-turn', status: 'completed' } } },
    { method: 'item/agentMessage/delta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'late-agent', delta: 'must be suppressed' } },
    { method: 'item/completed', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'failed-command', type: 'commandExecution', status: 'completed', aggregatedOutput: 'incorrect success' } } },
    { method: 'thread/afterTerminalUnknown', params: { threadId: 'c1-thread' } },
  ])

  const failedResult = events.find(event => event['type'] === 'tool-result')
  assert.ok(failedResult)
  assert.equal(failedResult['id'], 'failed-command')
  assert.equal(failedResult['isError'], true)
  assert.equal(failedResult['status'], 'failed')
  assert.equal(failedResult['error'], 'exit status 1')
  assert.deepEqual(failedResult['errorDetails'], { message: 'exit status 1' })

  const terminalEvents = events.filter(event => event['type'] === 'turn_failed')
  assert.equal(terminalEvents.length, 1)
  assert.equal(terminalEvents[0]?.['error'], 'terminal failure')
  assert.deepEqual(terminalEvents[0]?.['errorDetails'], { message: 'terminal failure', additionalDetails: 'diagnostic', codexErrorInfo: { code: 'turn_failed' } })
  assert.ok(normalizeExternalEngineEvent(failedResult, 'codex-cli'))
  assert.ok(normalizeExternalEngineEvent(terminalEvents[0], 'codex-cli'))
  assert.equal(events.some(event => event['itemId'] === 'late-agent'), false)
  assert.equal(events.some(event => event['output'] === 'incorrect success'), false)
  assert.equal(events.some(event => event['type'] === 'unknown-notification'), false)
})

test('CodexRuntime bridge events normalize without dropping failed turn details', async () => {
  const errorDetails = { message: 'turn exploded', additionalDetails: 'fixture diagnostic', codexErrorInfo: { code: 'fixture_turn_error' } }
  const events = await collectRuntimeNotifications([
    { method: 'turn/started', params: { threadId: 'c1-thread', turn: { id: 'c1-turn', status: 'inProgress' } } },
    { method: 'item/agentMessage/delta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'bridge-agent', delta: 'assistant bridge text' } },
    { method: 'item/reasoning/textDelta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'bridge-reasoning', delta: 'reasoning bridge text' } },
    { method: 'item/started', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'bridge-tool', type: 'commandExecution', command: 'false', status: 'inProgress' } } },
    { method: 'item/commandExecution/outputDelta', params: { threadId: 'c1-thread', turnId: 'c1-turn', itemId: 'bridge-tool', delta: 'raw command output' } },
    { method: 'item/completed', params: { threadId: 'c1-thread', turnId: 'c1-turn', item: { id: 'bridge-tool', type: 'commandExecution', command: 'false', status: 'failed', error: { message: 'command failed' }, stderr: 'stderr output' } } },
    { method: 'thread/tokenUsage/updated', params: { threadId: 'c1-thread', turnId: 'c1-turn', tokenUsage: { total: { inputTokens: 12, cachedInputTokens: 3, outputTokens: 7 }, last: { inputTokens: 8, cachedInputTokens: 2, outputTokens: 4 }, modelContextWindow: 128000 } } },
    { method: 'thread/bridgeUnknown', params: { threadId: 'c1-thread', value: 'raw-only notification' } },
    { method: 'turn/completed', params: { threadId: 'c1-thread', turn: { id: 'c1-turn', status: 'failed', error: errorDetails } } },
  ])

  for (const type of ['turn_started', 'text-delta', 'reasoning', 'tool-call', 'tool-result', 'usage_updated', 'turn_failed']) {
    const event = eventWithType(events, type)
    assert.ok(normalizeExternalEngineEvent(event, 'codex-cli'), `expected ${type} to normalize`)
  }

  const usage = eventWithType(events, 'usage_updated')
  assert.deepEqual(usage['usage'], {
    inputTokens: 12,
    cachedInputTokens: 3,
    outputTokens: 7,
    contextWindowMaxTokens: 128000,
  })

  const failedTurn = eventWithType(events, 'turn_failed')
  assert.equal(typeof failedTurn['error'], 'string')
  assert.equal(failedTurn['error'], 'turn exploded')
  assert.deepEqual(failedTurn['errorDetails'], errorDetails)

  const rawOutput = eventWithType(events, 'tool-output-delta')
  assert.equal(normalizeExternalEngineEvent(rawOutput, 'codex-cli'), undefined)
  const unknown = eventWithType(events, 'unknown-notification')
  assert.equal(normalizeExternalEngineEvent(unknown, 'codex-cli'), undefined)
})
