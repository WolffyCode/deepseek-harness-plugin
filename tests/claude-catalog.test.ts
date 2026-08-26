import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ClaudeCatalogCache,
  CatalogError,
  discoverModes,
  discoverThinking,
  mapSdkModel,
  mapSdkSlashCommand,
} from '../src/claude/catalog.js'

class FakeQuery {
  commands = [{ name: 'deploy', description: 'Deploy', argumentHint: '<env>', aliases: ['ship'] }]
  models = [{ value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Fast', supportsEffort: true, supportedEffortLevels: ['low', 'high'], supportsAdaptiveThinking: true, supportsFastMode: false, supportsAutoMode: true }]
  blockedCommands = false
  commandCalls = 0
  commandWaiters: Array<() => void> = []
  async supportedCommands(): Promise<readonly { name: string; description: string; argumentHint: string; aliases: string[] }[]> { this.commandCalls++; if (this.blockedCommands) await new Promise<void>(resolve => this.commandWaiters.push(resolve)); return this.commands }
  async supportedModels(): Promise<readonly { value: string; resolvedModel?: string; displayName: string; description: string; supportsEffort: boolean; supportedEffortLevels: string[]; supportsAdaptiveThinking: boolean; supportsFastMode: boolean; supportsAutoMode: boolean }[]> { return this.models }
  releaseCommands(): void { for (const resolve of this.commandWaiters.splice(0)) resolve() }
}

test('maps real SDK-shaped SlashCommand and ModelInfo fields by value', () => {
  assert.deepEqual(mapSdkSlashCommand({ name: 'deploy', description: 'Deploy', argumentHint: '<env>', aliases: ['ship'] }), {
    name: 'deploy', id: 'deploy', displayName: 'deploy', description: 'Deploy', argumentHint: '<env>', aliases: ['ship'],
  })
  const model = mapSdkModel({ value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Fast', supportsEffort: true, supportedEffortLevels: ['low', 'high'], supportsAdaptiveThinking: true, supportsFastMode: false, supportsAutoMode: true })
  assert.deepEqual(model, { id: 'sonnet', value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Fast', supportsEffort: true, supportedEffortLevels: ['low', 'high'], supportsAdaptiveThinking: true, supportsFastMode: false, supportsAutoMode: true })
  assert.equal(Object.isFrozen(model), true)
})

test('explicit discovery returns not_provided, supports abort, and converts failures', async () => {
  assert.deepEqual(await discoverModes(undefined), { status: 'not_provided' })
  assert.deepEqual(await discoverThinking(undefined), { status: 'not_provided' })
  assert.deepEqual(await discoverModes(async () => [{ id: 'plan', label: 'Plan' }]), { status: 'ok', value: [{ id: 'plan', label: 'Plan' }] })
  const failed = await discoverThinking(async () => { throw new Error('discovery failed') })
  assert.equal(failed.status, 'failure')
  assert.equal(failed.error.message, 'discovery failed')
  const controller = new AbortController()
  controller.abort()
  const aborted = await discoverModes(async signal => {
    signal?.throwIfAborted()
    return []
  }, { signal: controller.signal })
  assert.equal(aborted.status, 'failure')
  assert.equal(aborted.error.code, 'aborted')
})

test('catalog cache deduplicates refreshes, freezes output, and honors TTL/force', async () => {
  let now = 0
  const query = new FakeQuery()
  query.blockedCommands = true
  const cache = new ClaudeCatalogCache(query, { ttlMs: 50, clock: () => now })
  const first = cache.loadCommands()
  const second = cache.loadCommands()
  assert.equal(query.commandCalls, 1)
  query.releaseCommands()
  const [a, b] = await Promise.all([first, second])
  if (a.status !== 'ok' || b.status !== 'ok') throw new Error('expected command loads to succeed')
  const firstCommand = a.value[0]
  assert.ok(firstCommand)
  assert.deepEqual(firstCommand, { name: 'deploy', id: 'deploy', displayName: 'deploy', description: 'Deploy', argumentHint: '<env>', aliases: ['ship'] })
  assert.strictEqual(a.value, b.value)
  assert.equal(Object.isFrozen(a.value), true)
  assert.equal(Object.isFrozen(firstCommand), true)
  query.commands.push({ name: 'new', description: 'New', argumentHint: '', aliases: [] })
  assert.equal((await cache.loadCommands()).status, 'ok')
  assert.equal(query.commandCalls, 1)
  now = 51
  const forced = cache.loadCommands({ force: true })
  assert.equal(query.commandCalls, 2)
  query.releaseCommands()
  const result = await forced
  assert.equal(result.status, 'ok')
  assert.equal(result.value.length, 2)
})

test('catalog retains stale data on failure and reports first failure, timeout, abort, invalidate, close', async () => {
  let now = 0
  let fail = false
  const releases: Array<() => void> = []
  const modelReleases: Array<() => void> = []
  const query = {
    async supportedCommands(): Promise<readonly { name: string; description: string; argumentHint: string; aliases: string[] }[]> {
      await new Promise<void>(resolve => { releases.push(resolve) })
      if (fail) throw new Error('network')
      return [{ name: 'ok', description: 'ok', argumentHint: '', aliases: [] }]
    },
    async supportedModels(): Promise<readonly { value: string; displayName: string; description: string }[]> {
      await new Promise<void>(resolve => { modelReleases.push(resolve) })
      return []
    },
  }
  const cache = new ClaudeCatalogCache(query, { ttlMs: 1, clock: () => now })
  const first = cache.loadCommands()
  releases.shift()?.()
  const initial = await first
  assert.equal(initial.status, 'ok')
  now = 2
  fail = true
  const staleRequest = cache.loadCommands({ force: true })
  releases.shift()?.()
  const stale = await staleRequest
  if (stale.status !== 'failure') throw new Error('expected stale failure')
  assert.equal(stale.stale, true)
  assert.equal(stale.value?.[0]?.name, 'ok')
  cache.invalidate('commands')
  const failedRequest = cache.loadCommands()
  releases.shift()?.()
  const failed = await failedRequest
  if (failed.status !== 'failure') throw new Error('expected first failure')
  assert.equal(failed.stale, false)
  assert.equal(failed.error.code, 'query_failed')

  const controller = new AbortController()
  controller.abort()
  const aborted = await cache.loadModels({ signal: controller.signal })
  if (aborted.status !== 'failure') throw new Error('expected abort failure')
  assert.equal(aborted.error.code, 'aborted')
  const pendingModels = cache.loadModels({ timeoutMs: 1 })
  const timeout = await pendingModels
  if (timeout.status !== 'failure') throw new Error('expected timeout failure')
  assert.equal(timeout.error.code, 'timeout')
  modelReleases.shift()?.()
  cache.close()
  const closed = await cache.loadModels()
  if (closed.status !== 'failure') throw new Error('expected closed failure')
  assert.equal(closed.error.code, 'closed')
})

test('old invalidated slow request cannot overwrite a newer result and loadAll is immutable', async () => {
  let phase = 0
  let releaseOld!: () => void
  const query = {
    async supportedCommands(): Promise<readonly { name: string; description: string; argumentHint: string; aliases: string[] }[]> {
      if (phase === 0) await new Promise<void>(resolve => { releaseOld = resolve })
      return [{ name: phase === 0 ? 'old' : 'new', description: '', argumentHint: '', aliases: [] }]
    },
    async supportedModels(): Promise<readonly { value: string; displayName: string; description: string }[]> { return [{ value: 'm', displayName: 'M', description: '' }] },
  }
  const cache = new ClaudeCatalogCache(query, { ttlMs: 100 })
  const old = cache.loadCommands()
  cache.invalidate('commands')
  phase = 1
  const fresh = await cache.loadCommands()
  if (fresh.status !== 'ok') throw new Error('expected fresh result')
  assert.equal(fresh.value[0]?.name, 'new')
  releaseOld()
  await old
  const current = await cache.loadCommands()
  if (current.status !== 'ok') throw new Error('expected cached result')
  assert.equal(current.value[0]?.name, 'new')
  const all = await cache.loadAll()
  assert.equal(all.commands.status, 'ok')
  assert.equal(all.models.status, 'ok')
  assert.equal(Object.isFrozen(all), true)
})
