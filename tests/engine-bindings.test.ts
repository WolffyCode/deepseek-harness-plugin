import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
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
