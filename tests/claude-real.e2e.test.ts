import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import { createClaudeProviderSession } from '../src/claude/adapter.js'
import type { ClaudeAdapterEvent, ClaudeAgentSession, ClaudeQueryFactory } from '../src/claude/types.js'

const DEFAULT_MODEL = 'glm-5.3'
const TIMEOUT_MS = 120_000

type RealConfig = {
  readonly baseUri: string
  readonly authToken: string
  readonly model: string
  readonly executable: string
}

type TurnObservation = {
  readonly result: { readonly finalText: string }
  readonly firstToken: boolean
  readonly permissionRequested: boolean
  readonly permissionResolved: boolean
  readonly toolCall: boolean
  readonly toolResult: boolean
}

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return undefined
}

function readConfig(): { readonly config?: RealConfig; readonly skip?: string; readonly reject?: string } {
  const baseUri = firstEnv('DSH_CLAUDE_REAL_BASE_URI', 'DSH_DEBUG_GLM_BASE_URI', 'ANTHROPIC_BASE_URL')
  const authToken = firstEnv('DSH_CLAUDE_REAL_AUTH_TOKEN', 'DSH_DEBUG_GLM_AUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN')
  const model = firstEnv('DSH_CLAUDE_REAL_MODEL') ?? DEFAULT_MODEL
  const executable = firstEnv('DSH_CLAUDE_REAL_EXECUTABLE') ?? 'claude'
  const missing = [
    baseUri ? undefined : 'DSH_CLAUDE_REAL_BASE_URI',
    authToken ? undefined : 'DSH_CLAUDE_REAL_AUTH_TOKEN',
  ].filter((value): value is string => value !== undefined)
  if (missing.length) return { skip: `missing real Claude provider environment: ${missing.join(', ')} (model defaults to ${DEFAULT_MODEL})` }
  if (/opus/i.test(model)) return { reject: `Claude real E2E rejects Opus model: ${model}` }
  if (!/glm/i.test(model)) return { reject: `Claude real E2E only permits GLM models; received ${model}` }
  const cli = spawnSync(executable, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 })
  if (cli.error) return { skip: `local Claude CLI precondition failed for ${executable}: ${cli.error.message}` }
  if (cli.status !== 0) return { skip: `local Claude CLI precondition failed for ${executable}: exit ${cli.status ?? 'unknown'}` }
  return { config: { baseUri: baseUri!, authToken: authToken!, model, executable } }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}

function redact(text: string, secret: string): string {
  return secret.length === 0 ? text : text.split(secret).join('[REDACTED]')
}

function safeError(error: unknown, secret: string): string {
  return redact(error instanceof Error ? error.message : String(error), secret)
}


async function containsSecret(root: string, secret: string): Promise<boolean> {
  async function walk(directory: string): Promise<boolean> {
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return false }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (await walk(path)) return true
      } else {
        try {
          if ((await readFile(path, 'utf8')).includes(secret)) return true
        } catch { /* binary/rotating files are not text diagnostics */ }
      }
    }
    return false
  }
  return secret.length > 0 && walk(root)
}

function createSession(config: RealConfig, cwd: string, configDir: string, queryCount: { value: number }, resumeSessionId?: string): ClaudeAgentSession {
  const queryFactory: ClaudeQueryFactory = ({ prompt, options }) => {
    queryCount.value += 1
    return sdkQuery({ prompt, options })
  }
  return createClaudeProviderSession({
    cwd,
    model: config.model,
    baseUri: config.baseUri,
    authToken: config.authToken,
    executablePath: config.executable,
    permissionMode: 'default',
    persistSession: true,
    permissionTimeoutMs: 30_000,
    environment: { CLAUDE_CONFIG_DIR: configDir, ANTHROPIC_API_KEY: '' },
    queryFactory,
    ...(resumeSessionId === undefined ? {} : { resumeSessionId }),
  })
}

async function runTurn(session: ClaudeAgentSession, prompt: string): Promise<TurnObservation> {
  let firstToken = false
  let permissionRequested = false
  let permissionResolved = false
  let toolCall = false
  let toolResult = false
  const off = session.subscribe((event: ClaudeAdapterEvent) => {
    if (event.type === 'timeline' && event.item.type === 'assistant_message' && event.item.partial === true && typeof event.item.text === 'string' && event.item.text.length > 0) firstToken = true
    if (event.type === 'timeline' && event.item.type === 'tool_call') toolCall = true
    if (event.type === 'timeline' && event.item.type === 'tool_result') toolResult = true
    if (event.type === 'permission_requested' && !permissionRequested) {
      permissionRequested = true
      permissionResolved = session.respondToPermission(event.request.requestId, {
        behavior: 'allow',
        updatedInput: event.request.input,
        ...(event.request.toolUseId === undefined ? {} : { toolUseID: event.request.toolUseId }),
      })
    }
  })
  try {
    const result = await withTimeout(session.run(prompt), 'Claude real turn')
    return { result, firstToken, permissionRequested, permissionResolved, toolCall, toolResult }
  } finally {
    off()
  }
}

const preflight = readConfig()
const realTest = test('Claude real CLI + SDK query E2E (opt-in)', { skip: preflight.skip }, async () => {
  if (preflight.reject) throw new Error(preflight.reject)
  const config = preflight.config
  assert.ok(config)
  const root = await mkdtemp(join(tmpdir(), 'dsh-claude-real-test-'))
  const cwd = join(root, 'cwd')
  const configDir = join(root, 'claude-config')
  await mkdir(cwd, { recursive: true })
  await mkdir(configDir, { recursive: true })
  const queryCount = { value: 0 }
  let session: ClaudeAgentSession | undefined
  try {
    session = createSession(config, cwd, configDir, queryCount)
    await withTimeout(session.whenReady?.() ?? Promise.reject(new Error('Claude session has no readiness gate')), 'Claude initialization')
    const nativeSessionId = session.sessionId
    assert.ok(nativeSessionId, 'real Claude system/init did not provide a native session id')
    assert.equal(queryCount.value, 1, 'the E2E must create an SDK query')
    const first = await runTurn(session, 'Use the Bash tool to run exactly: printf REAL_TOOL_OK. Then reply with exactly: REAL_CLAUDE_OK')
    assert.equal(first.firstToken, true, 'the first assistant token must arrive through the partial stream')
    assert.equal(first.permissionRequested, true, 'the real Bash turn must cross the permission callback')
    assert.equal(first.permissionResolved, true, 'the real permission request must be approved through the session API')
    assert.equal(first.toolCall, true, 'the real Bash tool call must be observable')
    assert.equal(first.toolResult, true, 'the real Bash tool result must be observable')
    assert.match(first.result.finalText, /REAL_CLAUDE_OK/)
    await session.close()
    await session.close()
    session = createSession(config, cwd, configDir, queryCount, nativeSessionId)
    await withTimeout(session.whenReady?.() ?? Promise.reject(new Error('Claude resumed session has no readiness gate')), 'Claude resume initialization')
    assert.equal(session.sessionId, nativeSessionId, 'resume must retain the native session id')
    const resumed = await runTurn(session, 'Reply with exactly: REAL_CLAUDE_RESUMED')
    assert.equal(resumed.firstToken, true)
    assert.match(resumed.result.finalText, /REAL_CLAUDE_RESUMED/)
    await session.close()
    session = undefined
    assert.equal(await containsSecret(root, config.authToken), false, 'the auth token must not be written to runtime files')
  } catch (error) {
    throw new Error(safeError(error, config.authToken))
  } finally {
    await session?.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

void realTest
