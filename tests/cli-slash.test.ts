import test from 'node:test'
import assert from 'node:assert/strict'
import { createCliSlashSource } from '../src/client/cli-slash.js'
import { setEngineSuiteComposerRuntime, setEngineSuiteSessionSelection } from '../src/client/composer-runtime.js'

test('CLI slash source claims a known CLI command and forwards its raw line', async () => {
  let received: { text: string; mode: string } | undefined
  const ctx = {
    get(name: string) {
      if (name === 'inputTriggers') return { registerSource: () => () => {} }
      if (name === 'sessions') return {
        binding: () => ({ session: { prompt: async (content: [{ type: 'text'; text: string }], mode: 'queue') => {
          received = { text: content[0].text, mode }
          return { ok: true as const }
        } } }),
      }
      throw new Error(`unexpected service: ${name}`)
    },
  } as never
  setEngineSuiteSessionSelection('cli-session', {
    engineId: 'claude-cli', providerId: 'provider', modelRecordId: 'model', reasoningEffort: 'max',
  })
  const source = createCliSlashSource(ctx)
  const outcome = await source.matchEnter?.({ sessionId: 'cli-session' }, '/help --raw', new AbortController().signal, { images: 0 })
  assert.ok(outcome && typeof outcome === 'object' && 'claim' in outcome)
  if (outcome && typeof outcome === 'object' && 'claim' in outcome) {
    const claim = (outcome as { claim: { submit: (args: string, actx: unknown, images: readonly unknown[]) => Promise<unknown> } }).claim
    const result = await claim.submit('', ctx, [])
    assert.deepEqual(result, { kind: 'success' })
  }
  assert.deepEqual(received, { text: '/help --raw', mode: 'queue' })
})

test('CLI slash source declines native Harness sessions', async () => {
  const ctx = {
    get(name: string) {
      if (name === 'inputTriggers') return { registerSource: () => () => {} }
      if (name === 'sessions') return { binding: () => undefined }
      throw new Error(`unexpected service: ${name}`)
    },
  } as never
  setEngineSuiteSessionSelection('native-session', {
    engineId: 'deepseek-native', providerId: 'deepseek', modelRecordId: 'model',
  })
  const source = createCliSlashSource(ctx)
  assert.equal(await source.matchEnter?.({ sessionId: 'native-session' }, '/help', new AbortController().signal, { images: 0 }), undefined)
})

test('CLI slash source forwards unknown native commands and leaves Harness commands alone', async () => {
  const ctx = {
    get(name: string) {
      if (name === 'inputTriggers') return { registerSource: () => () => {} }
      if (name === 'sessions') return { binding: () => ({ session: { prompt: async () => ({ ok: true as const }) } }) }
      throw new Error(`unexpected service: ${name}`)
    },
  } as never
  setEngineSuiteSessionSelection('cli-unknown', {
    engineId: 'codex-cli', providerId: 'provider', modelRecordId: 'model', reasoningEffort: 'low',
  })
  const source = createCliSlashSource(ctx)
  assert.ok(await source.matchEnter?.({ sessionId: 'cli-unknown' }, '/future-native-command arg', new AbortController().signal, { images: 0 }))
  assert.equal(await source.matchEnter?.({ sessionId: 'cli-unknown' }, '/permission', new AbortController().signal, { images: 0 }), undefined)
})

test('CLI slash source uses the current Session command catalog and keeps raw whitespace and quotes', async () => {
  let received: string | undefined
  const commands = [{ name: 'review', description: 'Review the working tree', argumentHint: '<scope>', source: 'skill' as const }]
  const ctx = {
    get(name: string) {
      if (name === 'inputTriggers') return { registerSource: () => () => {} }
      if (name === 'sessions') return {
        binding: () => ({ session: { prompt: async (content: [{ type: 'text'; text: string }]) => {
          received = content[0].text
          return { ok: true as const }
        } } }),
      }
      throw new Error(`unexpected service: ${name}`)
    },
  } as never
  setEngineSuiteSessionSelection('dynamic-cli-session', {
    engineId: 'claude-cli', providerId: 'glm', modelRecordId: 'glm-5',
  })
  const commandRequests: Array<{ sessionId: string; refresh: boolean }> = []
  setEngineSuiteComposerRuntime({
    catalog: {
      listCommands: async (sessionId: string, refresh: boolean) => {
        commandRequests.push({ sessionId, refresh })
        return commands
      },
    },
  } as unknown as import('../src/client/composer-runtime.js').EngineSuiteComposerRuntime)
  try {
    const source = createCliSlashSource(ctx)
    const candidates = await source.candidates({ sessionId: 'dynamic-cli-session' }, { query: 'rev', signal: new AbortController().signal })
    assert.deepEqual(candidates, [{ id: 'engine-suite-cli/review', label: 'review', detail: 'Review the working tree', argumentHint: '<scope>', source: 'skill' }])
    const outcome = await source.matchEnter?.({ sessionId: 'dynamic-cli-session' }, '  /review "two words"  ', new AbortController().signal, { images: 0 })
    assert.ok(outcome && typeof outcome === 'object' && 'claim' in outcome)
    if (outcome && typeof outcome === 'object' && 'claim' in outcome) {
      const claim = (outcome as { claim: { submit: (args: string, actx: unknown, images: readonly unknown[]) => Promise<unknown> } }).claim
      await claim.submit('', ctx, [])
    }
    assert.deepEqual(commandRequests, [{ sessionId: 'dynamic-cli-session', refresh: true }])
    assert.equal(received, '  /review "two words"  ')
  } finally {
    setEngineSuiteComposerRuntime(undefined)
  }
})

test('CLI slash source does not claim Harness commands even when a remote catalog advertises them', async () => {
  const ctx = {
    get(name: string) {
      if (name === 'inputTriggers') return { registerSource: () => () => {} }
      if (name === 'sessions') return { binding: () => ({ session: { prompt: async () => ({ ok: true as const }) } }) }
      throw new Error(`unexpected service: ${name}`)
    },
  } as never
  setEngineSuiteSessionSelection('harness-command-session', {
    engineId: 'codex-cli', providerId: 'codex', modelRecordId: 'codex-model',
  })
  setEngineSuiteComposerRuntime({
    catalog: { listCommands: async () => [{ name: 'goal', description: 'Harness goal', argumentHint: '', source: 'command' as const }] },
  } as unknown as import('../src/client/composer-runtime.js').EngineSuiteComposerRuntime)
  try {
    const source = createCliSlashSource(ctx)
    const candidates = await source.candidates({ sessionId: 'harness-command-session' }, { query: '', signal: new AbortController().signal })
    assert.deepEqual(candidates, [])
    assert.equal(await source.matchEnter?.({ sessionId: 'harness-command-session' }, '/goal ship it', new AbortController().signal, { images: 0 }), undefined)
  } finally {
    setEngineSuiteComposerRuntime(undefined)
  }
})
