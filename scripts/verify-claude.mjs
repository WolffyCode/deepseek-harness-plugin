import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import { createClaudeProviderSession } from '../src/claude/adapter.ts'
import { assertClaudeRealModelAllowed, preflightClaudeProvider } from '../src/claude/provider-preflight.ts'

const DEFAULT_MODEL = 'glm-5.3'
const TIMEOUT_MS = 120_000
const INITIALIZATION_TIMEOUT_MS = 30_000
const PROVIDER_PREFLIGHT_TIMEOUT_MS = 10_000

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return undefined
}

function readConfig() {
  const baseUri = firstEnv('DSH_CLAUDE_REAL_BASE_URI', 'DSH_DEBUG_GLM_BASE_URI', 'ANTHROPIC_BASE_URL')
  const authToken = firstEnv('DSH_CLAUDE_REAL_AUTH_TOKEN', 'DSH_DEBUG_GLM_AUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN')
  const model = firstEnv('DSH_CLAUDE_REAL_MODEL') ?? DEFAULT_MODEL
  const executable = firstEnv('DSH_CLAUDE_REAL_EXECUTABLE') ?? 'claude'
  return { baseUri, authToken, model, executable }
}

function redact(text, secret) {
  return secret ? text.split(secret).join('[REDACTED]') : text
}

function errorText(error, secret) {
  const value = error instanceof Error ? error.message : String(error)
  return redact(value, secret)
}


function preflight(config) {
  try {
    assertClaudeRealModelAllowed(config.model)
  } catch (error) {
    return { kind: 'failed', reason: errorText(error, '') }
  }
  const missing = []
  if (!config.baseUri) missing.push('DSH_CLAUDE_REAL_BASE_URI')
  if (!config.authToken) missing.push('DSH_CLAUDE_REAL_AUTH_TOKEN')
  if (missing.length) {
    return {
      kind: 'skipped',
      reason: `missing real Claude provider environment: ${missing.join(', ')} (model defaults to ${DEFAULT_MODEL}; aliases DSH_DEBUG_GLM_* and ANTHROPIC_* are accepted)`,
    }
  }
  return { kind: 'ready' }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}

async function containsSecret(root, secret) {
  if (!secret) return false
  async function walk(directory) {
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return false }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (await walk(path)) return true
        continue
      }
      try {
        if ((await readFile(path, 'utf8')).includes(secret)) return true
      } catch { /* binary/rotating files are not text diagnostics */ }
    }
    return false
  }
  return walk(root)
}

function createSession(config, cwd, configDir, resumeSessionId, queryState) {
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
    ...(resumeSessionId ? { resumeSessionId } : {}),
    queryFactory: ({ prompt, options }) => {
      queryState.count += 1
      return sdkQuery({ prompt, options })
    },
  })
}

async function runTurn(session, prompt) {
  const events = []
  let firstToken = false
  const permissionRequestIds = new Set()
  const permissionApiResponseIds = new Set()
  const permissionResolvedIds = new Set()
  let toolCall = false
  let toolResult = false
  const off = session.subscribe(event => {
    events.push(event)
    if (event.type === 'timeline' && event.item.type === 'assistant_message' && event.item.partial === true && event.item.text.length > 0) firstToken = true
    if (event.type === 'timeline' && event.item.type === 'tool_call') toolCall = true
    if (event.type === 'timeline' && event.item.type === 'tool_result') toolResult = true
    if (event.type === 'permission_requested') {
      const requestId = event.request.requestId
      if (permissionRequestIds.has(requestId)) return
      permissionRequestIds.add(requestId)
      if (session.respondToPermission(requestId, {
        behavior: 'allow',
        updatedInput: event.request.input,
        ...(event.request.toolUseId ? { toolUseID: event.request.toolUseId } : {}),
      })) permissionApiResponseIds.add(requestId)
    }
    if (event.type === 'permission_resolved') permissionResolvedIds.add(event.requestId)
  })
  try {
    const result = await withTimeout(session.run(prompt), TIMEOUT_MS, 'Claude real turn')
    const permissionRequested = permissionRequestIds.size > 0
    const permissionResolved = permissionRequestIds.size > 0 && [...permissionRequestIds].every(requestId => permissionApiResponseIds.has(requestId) && permissionResolvedIds.has(requestId))
    return {
      result,
      events,
      firstToken,
      permissionRequested,
      permissionResolved,
      permissionStatus: permissionResolved ? 'requested-and-allowed' : 'requested-unresolved',
      toolCall,
      toolResult,
    }
  } finally {
    off()
  }
}

const config = readConfig()
const precondition = preflight(config)
if (precondition.kind === 'skipped') {
  console.error(JSON.stringify({ status: 'skipped', reason: precondition.reason }))
  process.exitCode = 2
} else if (precondition.kind === 'failed') {
  console.error(JSON.stringify({ status: 'failed', reason: precondition.reason }))
  process.exitCode = 1
} else {
  let root
  let session
  const queryState = { count: 0 }
  try {
    const provider = await preflightClaudeProvider({
      baseUri: config.baseUri,
      authToken: config.authToken,
      model: config.model,
      timeoutMs: PROVIDER_PREFLIGHT_TIMEOUT_MS,
    })
    if (!provider.ok) throw new Error(`[external-provider:${provider.kind}] ${provider.message}`)
    const cli = spawnSync(config.executable, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 })
    if (cli.error) throw new Error(`local Claude CLI precondition failed for ${config.executable}: ${cli.error.message}`)
    if (cli.status !== 0) throw new Error(`local Claude CLI precondition failed for ${config.executable}: exit ${cli.status ?? 'unknown'}`)
    root = await mkdtemp(join(tmpdir(), 'dsh-claude-real-'))
    const cwd = join(root, 'cwd')
    const configDir = join(root, 'claude-config')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(cwd, { recursive: true })
    await mkdir(configDir, { recursive: true })
    session = createSession(config, cwd, configDir, undefined, queryState)
    await withTimeout(session.whenReady(), INITIALIZATION_TIMEOUT_MS, 'Claude initialization')
    const nativeSessionId = session.sessionId
    if (!nativeSessionId) throw new Error('Claude initialization did not expose a native session id')
    const permissionTarget = join(root, 'permission-target.txt')
    const turn = await runTurn(session, `Do not use Bash. Use the Write tool to write exactly REAL_PERMISSION_OK to this absolute path: ${permissionTarget}. Then reply with exactly: REAL_CLAUDE_OK`)
    if (!turn.firstToken) throw new Error('Claude real stream did not emit a partial assistant token')
    if (!turn.permissionRequested) throw new Error('Claude real Write turn did not cross the permission callback')
    if (!turn.permissionResolved) throw new Error('Claude real permission requests were not all resolved through the session API')
    if (turn.permissionStatus !== 'requested-and-allowed') throw new Error(`Claude real permission status was ${turn.permissionStatus}`)
    if (session.pendingPermissions().length !== 0) throw new Error('Claude real permission registry still has pending requests after the turn')
    if (!turn.toolCall || !turn.toolResult) throw new Error('Claude real Write tool call/result was not observed')
    if (!turn.result.finalText.includes('REAL_CLAUDE_OK')) throw new Error('Claude real response missed the smoke marker')
    if (await readFile(permissionTarget, 'utf8') !== 'REAL_PERMISSION_OK') throw new Error('Claude real Write tool did not write the expected safe marker')
    await session.close()
    await session.close()
    session = createSession(config, cwd, configDir, nativeSessionId, queryState)
    await withTimeout(session.whenReady(), INITIALIZATION_TIMEOUT_MS, 'Claude resume initialization')
    if (session.sessionId !== nativeSessionId) throw new Error('Claude resume returned a different native session id')
    const resumed = await runTurn(session, 'Reply with exactly: REAL_CLAUDE_RESUMED')
    if (!resumed.firstToken || !resumed.result.finalText.includes('REAL_CLAUDE_RESUMED')) throw new Error('Claude resume did not stream the expected response')
    await session.close()
    session = undefined
    if (await containsSecret(root, config.authToken)) throw new Error('Claude real runtime files contain the auth token')
    console.log(JSON.stringify({
      status: 'ok',
      cli: config.executable,
      model: config.model,
      sdkQueryCalls: queryState.count,
      nativeSessionId,
      stream: true,
      tool: true,
      permission: {
        status: turn.permissionStatus,
        requested: turn.permissionRequested,
        resolved: turn.permissionResolved,
      },
      resume: true,
      close: true,
      secretOnDisk: false,
    }))
  } catch (error) {
    const message = errorText(error, config.authToken)
    console.error(JSON.stringify({ status: 'failed', reason: message }))
    process.exitCode = 1
  } finally {
    await session?.close().catch(() => undefined)
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  }
}
