import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import test from 'node:test'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'
import { EngineSuiteAgentService } from '../src/agent/service.js'
import type { ClaudeAdapterEvent, ClaudeAgentSession, ClaudeAdapterOptions, ClaudeCatalog, ClaudeThinkingOption } from '../src/claude/types.js'
import { createParentChildLineageStore, type ParentChildLineageDescriptor } from '../src/orchestration/lineage.js'

const catalog: ClaudeCatalog = { models: [], commands: [], modes: [], skills: [], mcpServers: [], capabilities: [] }

class CompletingClaudeSession implements ClaudeAgentSession {
  readonly capabilities = {}
  readonly catalog = catalog
  readonly calls: string[] = []
  readonly sessionId: string
  private readonly listeners = new Set<(event: ClaudeAdapterEvent) => void>()
  private closed = false
  private turn = 0

  constructor(options: ClaudeAdapterOptions, id: string) {
    this.sessionId = options.resumeSessionId ?? id
  }

  persistenceHandle() {
    return { provider: 'claude-cli' as const, sessionId: this.sessionId, nativeHandle: this.sessionId, cwd: '/tmp' }
  }

  subscribe(listener: (event: ClaudeAdapterEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async startTurn(prompt: string): Promise<{ readonly turnId: string }> {
    this.calls.push(`start:${prompt}`)
    const turnId = `claude-turn-${++this.turn}`
    this.emit({ type: 'turn_started', turnId, sessionId: this.sessionId })
    this.emit({ type: 'timeline', turnId, item: { type: 'assistant_message', text: `claude:${prompt}` } })
    this.emit({ type: 'turn_completed', turnId, result: `claude:${prompt}` })
    return { turnId }
  }

  async run(prompt: string) { const { turnId } = await this.startTurn(prompt); return { sessionId: this.sessionId, turnId, finalText: `claude:${prompt}` } }
  async interrupt(): Promise<void> { this.calls.push('interrupt') }
  async close(): Promise<void> { if (!this.closed) { this.closed = true; this.calls.push('close') } }
  async setMode(mode: string): Promise<void> { this.calls.push(`mode:${mode}`) }
  async setModel(model?: string): Promise<void> { this.calls.push(`model:${model ?? ''}`) }
  async setThinking(thinking: ClaudeThinkingOption): Promise<void> { this.calls.push(`thinking:${thinking.type}`) }
  async setPermissionMode(): Promise<void> {}
  respondToPermission(): boolean { return false }
  respondToUserQuestion(): boolean { return false }
  pendingPermissions(): readonly never[] { return [] }
  persistenceHandleRequired(): never { throw new Error('unused') }
  listCommands(): readonly never[] { return [] }
  async refreshCatalog(): Promise<ClaudeCatalog> { return catalog }
  async steer(): Promise<{ readonly status: 'unavailable' }> { return { status: 'unavailable' } }

  private emit(event: ClaudeAdapterEvent): void { for (const listener of [...this.listeners]) listener(event) }
}

function fakeCodexServer(): string {
  return [
    "let buffer='';process.stdin.setEncoding('utf8');",
    "const send=value=>process.stdout.write(JSON.stringify(value)+String.fromCharCode(10));",
    "const handle=m=>{",
    "if(m.method==='initialize')send({jsonrpc:'2.0',id:m.id,result:{ok:true}});",
    "else if(m.method==='initialized'){}",
    "else if(m.method==='thread/start')send({jsonrpc:'2.0',id:m.id,result:{thread:{id:'urn:uuid:00000000-0000-4000-8000-000000000001',ephemeral:false}}});",
    "else if(m.method==='thread/resume')send({jsonrpc:'2.0',id:m.id,result:{thread:{id:m.params.threadId,ephemeral:false}}});",
    "else if(m.method==='turn/start'){send({jsonrpc:'2.0',id:m.id,result:{turn:{id:'child-turn'}}});setTimeout(()=>send({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{turnId:'child-turn',delta:'child-result'}}),5);setTimeout(()=>send({jsonrpc:'2.0',method:'turn/completed',params:{turnId:'child-turn',turn:{id:'child-turn',status:'completed'}}}),10);}};",
    "process.stdin.on('data',chunk=>{buffer+=chunk;let newline;while((newline=buffer.indexOf(String.fromCharCode(10)))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(line.trim())handle(JSON.parse(line));}});",
    "process.stdin.on('end',()=>process.exit(0));",
  ].join('')
}

function registerCrossEngineProfiles(suite: ReturnType<typeof createEngineSuiteRuntime>): void {
  suite.providers.register({ id: 'claude-provider', engineId: 'claude-cli', name: 'Claude', baseUri: 'https://example.test', credentialRef: 'claude-key' })
  suite.providers.register({ id: 'codex-provider', engineId: 'codex-cli', name: 'Codex', baseUri: 'https://example.test', credentialRef: 'codex-key' })
  suite.models.register({ id: 'claude-model', engineId: 'claude-cli', providerId: 'claude-provider', modelId: 'glm-5.3', reasoningOptions: [{ id: 'high' }], source: 'manual' })
  suite.models.register({ id: 'codex-model', engineId: 'codex-cli', providerId: 'codex-provider', modelId: 'gpt-child', reasoningOptions: [{ id: 'low' }], source: 'manual' })
  suite.profiles.register({ id: 'claude-parent', selection: { engineId: 'claude-cli', providerId: 'claude-provider', modelRecordId: 'claude-model', reasoningEffort: 'high' }, allowedChildProfiles: ['codex-child'], maxChildDepth: 1, maxConcurrentChildren: 2 })
  suite.profiles.register({ id: 'codex-child', selection: { engineId: 'codex-cli', providerId: 'codex-provider', modelRecordId: 'codex-model', reasoningEffort: 'low' } })
}

test('ParentChildLineage persists descriptors and replays child lifecycle events', async () => {
  const store = createParentChildLineageStore()
  const descriptor: ParentChildLineageDescriptor = {
    parentSessionId: 'parent', nativeTaskId: 'native-task', childSessionId: 'child', depth: 1, profile: 'codex-child', status: 'running',
  }
  store.create(descriptor)
  const live: string[] = []
  store.subscribe('parent', event => live.push(event.type))
  store.append({ parentSessionId: 'parent', nativeTaskId: 'native-task', childSessionId: 'child', type: 'progress', data: 'working' })
  store.append({ parentSessionId: 'parent', nativeTaskId: 'native-task', childSessionId: 'child', type: 'result', data: 'done' })
  assert.deepEqual(live, ['progress', 'result'])
  assert.deepEqual(store.replay('parent').map(event => event.type), ['progress', 'result'])
  assert.equal(store.getByChildSessionId('child')?.status, 'completed')
  store.update('child', { status: 'completed' })
  assert.equal(store.getByChildSessionId('child')?.status, 'completed')
})

test('Claude parent delegates a Codex child and supports resume/archive/detach across engines', async () => {
  const claudeSessions: ClaudeAdapterOptions[] = []
  let claudeId = 0
  const suite = createEngineSuiteRuntime({ claudeSessionFactory: options => { claudeSessions.push(options); return new CompletingClaudeSession(options, `claude-native-${++claudeId}`) } })
  registerCrossEngineProfiles(suite)
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const service = new EngineSuiteAgentService(ctx, suite, () => 'test-key')
  const parent = await service.createExternal({ sessionId: 'claude-parent-session', selection: suite.profiles.get('claude-parent').selection, apiKey: 'test-key', cwd: '/tmp' })
  const events: string[] = []
  const unsubscribe = service.subscribeLineage('claude-parent-session', event => events.push(event.type))
  try {
    const created = await service.delegate('claude-parent-session', { profileId: 'codex-child', task: 'inspect child', executable: process.execPath, args: ['-e', fakeCodexServer()] })
    assert.equal(created.handle.parentSessionId, 'claude-parent-session')
    assert.equal(created.lineage.nativeTaskId.length > 0, true)
    assert.deepEqual(service.listLineages('claude-parent-session').map(lineage => lineage.childSessionId), [String(created.handle.session.id)])
    assert.ok(events.includes('result'))

    await created.handle.dispose()
    const resumed = await service.resumeChild(String(created.handle.session.id))
    assert.equal(resumed.selection.engineId, 'codex-cli')
    const archived = await service.archiveChild(String(resumed.session.id))
    assert.equal(archived.status, 'archived')
    assert.equal(service.list().some(handle => String(handle.session.id) === String(resumed.session.id)), false)
    await assert.rejects(() => service.resumeChild(String(resumed.session.id)), /cannot resume archived child session/)

    const second = await service.delegate('claude-parent-session', { profileId: 'codex-child', task: 'detach child', executable: process.execPath, args: ['-e', fakeCodexServer()] })
    const detached = await service.detachChild(String(second.handle.session.id))
    assert.equal(detached.status, 'detached')
    await parent.dispose()
    assert.equal(service.list().some(handle => String(handle.session.id) === String(second.handle.session.id)), true)
    await second.handle.dispose()
    assert.equal(service.listLineages('claude-parent-session').find(lineage => lineage.childSessionId === String(second.handle.session.id))?.status, 'detached')
  } finally {
    unsubscribe()
    await parent.dispose()
    for (const handle of service.list()) await handle.dispose()
  }
  assert.equal(claudeSessions[0]?.model, 'glm-5.3')
})
