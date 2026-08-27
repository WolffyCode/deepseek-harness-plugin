import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ExternalEngineBindingStore, type ExternalEngineBinding } from '../src/engine/bindings.js'

function binding(sessionId: string): ExternalEngineBinding {
  return {
    sessionId,
    engineId: 'codex-cli',
    nativeSessionId: `native-${sessionId}`,
    runtimeRoot: `/tmp/${sessionId}`,
    selection: {
      engineId: 'codex-cli',
      providerId: 'provider',
      modelRecordId: 'model',
      reasoningEffort: 'low',
    },
  }
}

test('binding persists custom Codex launch configuration for cold resume', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-bindings-launch-test-'))
  const file = join(root, 'engine-bindings.json')
  const expected: ExternalEngineBinding = {
    ...binding('cold-session'),
    executable: '/opt/codex-wrapper',
    args: ['app-server', '--listen', 'stdio://'],
  }
  try {
    await new ExternalEngineBindingStore(file).put(expected)
    assert.deepEqual(await new ExternalEngineBindingStore(file).get(expected.sessionId), expected)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('binding writes from independent service instances preserve every native session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-bindings-test-'))
  const file = join(root, 'engine-bindings.json')
  try {
    const first = new ExternalEngineBindingStore(file)
    const second = new ExternalEngineBindingStore(file)
    const expected = Array.from({ length: 24 }, (_, index) => binding(`session-${index}`))
    await Promise.all(expected.map((value, index) => (index % 2 === 0 ? first : second).put(value)))
    const actual = await Promise.all(expected.map(value => first.get(value.sessionId)))
    assert.deepEqual(actual, expected)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('binding store migrates the legacy v1 thread id and writes the v2 schema', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-bindings-migration-test-'))
  const file = join(root, 'engine-bindings.json')
  const legacy = {
    version: 1,
    bindings: [{
      ...binding('legacy-session'),
      nativeSessionId: undefined,
      threadId: 'legacy-native',
    }],
  }
  try {
    await writeFile(file, `${JSON.stringify(legacy)}\n`, { mode: 0o600 })
    const store = new ExternalEngineBindingStore(file)
    assert.deepEqual(await store.get('legacy-session'), {
      ...binding('legacy-session'),
      nativeSessionId: 'legacy-native',
    })
    await store.put({
      ...binding('legacy-session'),
      nativeSessionId: 'legacy-native',
    })
    const persisted = await readFile(file, 'utf8')
    assert.match(persisted, /"version": 2/u)
    assert.doesNotMatch(persisted, /threadId/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('binding store rejects unknown fields and credential values instead of dropping them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-engine-bindings-schema-test-'))
  const file = join(root, 'engine-bindings.json')
  try {
    await writeFile(file, JSON.stringify({ version: 2, bindings: [{ ...binding('invalid-session'), apiKey: 'must-not-persist' }] }))
    await assert.rejects(new ExternalEngineBindingStore(file).get('invalid-session'), /must not declare apiKey/u)
    await writeFile(file, JSON.stringify({ version: 2, bindings: [{ ...binding('invalid-root'), runtimeRoot: 'relative-runtime' }] }))
    await assert.rejects(new ExternalEngineBindingStore(file).get('invalid-root'), /runtimeRoot must be an absolute path/u)
    await writeFile(file, JSON.stringify({ version: 2, bindings: [{ ...binding('invalid-args'), args: ['--api-key', 'must-not-persist'] }] }))
    await assert.rejects(new ExternalEngineBindingStore(file).get('invalid-args'), /must not carry credentials/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
