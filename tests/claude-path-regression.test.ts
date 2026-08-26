import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceRoot = new URL('../src/', import.meta.url)

async function assertMissing(path: string): Promise<void> {
  await assert.rejects(access(new URL(path, sourceRoot)))
}

test('EngineSuite Claude has one ProviderSession implementation and no legacy runtime or launch path', async () => {
  const engineSuiteSource = await readFile(new URL('engine-suite.ts', sourceRoot), 'utf8')
  const adapterSource = await readFile(new URL('claude/adapter.ts', sourceRoot), 'utf8')
  const sessionSource = await readFile(new URL('claude/session.ts', sourceRoot), 'utf8')
  const processSource = await readFile(new URL('claude/process.ts', sourceRoot), 'utf8')

  assert.match(engineSuiteSource, /createClaudeProviderSession/)
  assert.match(engineSuiteSource, /ClaudeSessionRuntimeBridge/)
  assert.doesNotMatch(engineSuiteSource, /claude\/(?:runtime|launch)/)
  assert.doesNotMatch(engineSuiteSource, /ClaudeRuntime|openClaudeLaunch/)
  assert.match(adapterSource, /new ClaudeProviderSession/)
  assert.match(sessionSource, /new ClaudeSdkTransport/)
  assert.match(sessionSource, /ClaudeProcess\.start/)
  assert.match(processSource, /detached: process\.platform !== 'win32'/)

  await assertMissing('claude/runtime.ts')
  await assertMissing('claude/launch.ts')
  assert.doesNotMatch(sessionSource, /ClaudeRuntime|openClaudeLaunch/)
})
