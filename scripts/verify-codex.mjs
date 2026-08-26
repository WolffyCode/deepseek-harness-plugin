import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngineSuiteRuntime } from '../src/engine-suite.ts'

const baseUri = process.env.DSH_DEBUG_CODEX_BASE_URI?.trim()
const apiKey = process.env.DSH_DEBUG_CODEX_API_KEY?.trim()
if (!baseUri || !apiKey) throw new Error('set DSH_DEBUG_CODEX_BASE_URI and DSH_DEBUG_CODEX_API_KEY in the process environment')

const root = await mkdtemp(join(tmpdir(), 'dsh-engine-suite-codex-smoke-'))
const suite = createEngineSuiteRuntime()
suite.providers.register({
  id: 'smoke-codex', engineId: 'codex-cli', name: 'Codex Smoke Provider',
  baseUri, credentialRef: 'smoke-codex', wireApi: 'responses', authMode: 'api-key', enabled: true,
})
suite.models.register({
  id: 'smoke-codex/gpt-5.6-sol', engineId: 'codex-cli', providerId: 'smoke-codex',
  modelId: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', enabled: true, hidden: false,
  reasoningOptions: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'xhigh' }, { id: 'max' }],
  defaultReasoningEffort: 'low', inputModalities: ['text'], contextWindowSource: 'unknown', source: 'manual',
})

const launch = await suite.openCodex({
  engineId: 'codex-cli', providerId: 'smoke-codex', modelRecordId: 'smoke-codex/gpt-5.6-sol', reasoningEffort: 'low',
}, { apiKey, cwd: process.cwd(), runtimeRoot: root, preserveRuntimeRoot: true })
let text = ''
let completed = false
const off = launch.runtime.transport.onNotification((method, params) => {
  if (method === 'turn/completed') {
    completed = true
    return
  }
  if (method !== 'item/agentMessage/delta' || typeof params !== 'object' || params === null || Array.isArray(params)) return
  if (typeof params.delta === 'string') text += params.delta
})

async function hasSecret(directory) {
  const walk = async (path) => {
    let entries
    try { entries = await readdir(path, { withFileTypes: true }) } catch { return false }
    for (const entry of entries) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) {
        if (await walk(child)) return true
        continue
      }
      try {
        if ((await readFile(child, 'utf8')).includes(apiKey)) return true
      } catch { /* binary or rotated file */ }
    }
    return false
  }
  return walk(directory)
}

try {
  await launch.runtime.startTurn('请只回复：CODEX_REAL_SMOKE_OK')
  for (let attempt = 0; attempt < 120 && !completed; attempt++) await new Promise(resolve => setTimeout(resolve, 250))
  if (!text.includes('CODEX_REAL_SMOKE_OK')) throw new Error(`Codex response did not contain the smoke marker: ${text.slice(0, 200)}`)
  if (await hasSecret(root)) throw new Error('Codex runtime files contain the API key')
  console.log(JSON.stringify({
    CODEX_REAL_SMOKE_OK: true,
    engine: 'codex-cli',
    provider: 'smoke-codex',
    model: 'gpt-5.6-sol',
    threadId: launch.runtime.threadId,
    response: text,
  }))
} finally {
  off()
  await launch.close()
  await rm(root, { recursive: true, force: true })
}
