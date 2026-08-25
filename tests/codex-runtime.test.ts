import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { PassThrough } from 'node:stream'
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
    "else if(m.method==='model/list') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{data:[{id:'model-one',model:'model-one',displayName:'Model One',description:'fixture',hidden:false,isDefault:true,defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'low',description:'low'},{reasoningEffort:'high',description:'high'}]}],nextCursor:null}})+'\\n');",
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
})
