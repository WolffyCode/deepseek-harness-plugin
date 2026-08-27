import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import { createClaudeProviderSession } from '../src/claude/adapter.js'
import { assertClaudeRealModelAllowed, preflightClaudeProvider } from '../src/claude/provider-preflight.js'
import type { ClaudeAdapterEvent, ClaudeAgentSession, ClaudePermissionHandlerResult, ClaudeQueryFactory } from '../src/claude/types.js'

const DEFAULT_MODEL = 'glm-5.3'
const PROVIDER_PREFLIGHT_TIMEOUT_MS = 10_000
const INITIALIZATION_TIMEOUT_MS = 30_000
const TURN_TIMEOUT_MS = 120_000
const MCP_INPUT = 'CLAUDE_ASSET_MCP_INPUT'
const MCP_RESULT = `MCP_FIXTURE_RESULT:${MCP_INPUT}`
const MCP_RESPONSE = `MCP_ASSET_OK:${MCP_RESULT}`
const SKILL_NAME = 'claude-asset-e2e'
const SKILL_RESPONSE = 'CLAUDE_SKILL_ASSET_OK'

interface RealConfig {
  readonly baseUri: string
  readonly authToken: string
  readonly model: string
  readonly executable: string
}

interface TurnObservation {
  readonly finalText: string
  readonly firstToken: boolean
  readonly mcpToolCall: boolean
  readonly mcpToolResult: boolean
  readonly permissionRequested: boolean
  readonly permissionResolved: boolean
  readonly permissionTools: readonly string[]
  readonly events: readonly ClaudeAdapterEvent[]
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
  try {
    assertClaudeRealModelAllowed(model)
  } catch (error) {
    return { reject: error instanceof Error ? error.message : String(error) }
  }
  const missing = [
    baseUri ? undefined : 'DSH_CLAUDE_REAL_BASE_URI',
    authToken ? undefined : 'DSH_CLAUDE_REAL_AUTH_TOKEN',
  ].filter((value): value is string => value !== undefined)
  if (missing.length > 0) {
    return { skip: `missing real Claude provider environment: ${missing.join(', ')}` }
  }
  return { config: { baseUri: baseUri!, authToken: authToken!, model, executable } }
}

function redact(text: string, secret: string): string {
  return secret.length === 0 ? text : text.split(secret).join('[REDACTED]')
}

function safeError(error: unknown, secret: string): string {
  return redact(error instanceof Error ? error.message : String(error), secret)
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(value => {
      clearTimeout(timer)
      resolve(value)
    }, error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

interface McpAuditEntry {
  readonly method: string
  readonly name?: string
  readonly text?: string
}

async function readAudit(path: string): Promise<readonly McpAuditEntry[]> {
  const contents = await readFile(path, 'utf8')
  const trimmed = contents.trim()
  if (trimmed.length === 0) return []
  return trimmed.split('\n').map(line => JSON.parse(line) as McpAuditEntry)
}

async function containsSecret(root: string, secret: string): Promise<boolean> {
  async function walk(directory: string): Promise<boolean> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (await walk(path)) return true
      } else {
        try {
          if ((await readFile(path, 'utf8')).includes(secret)) return true
        } catch {
          // Ignore binary and concurrently removed runtime files.
        }
      }
    }
    return false
  }
  return secret.length > 0 && walk(root)
}

const MCP_SERVER_SOURCE = String.raw`
import { appendFileSync } from 'node:fs'

const auditPath = process.env.MCP_FIXTURE_AUDIT_PATH
if (!auditPath) throw new Error('MCP_FIXTURE_AUDIT_PATH is required')

function record(entry) {
  appendFileSync(auditPath, JSON.stringify(entry) + '\n', 'utf8')
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}

function fail(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

function handle(message) {
  const method = typeof message?.method === 'string' ? message.method : ''
  const params = message?.params && typeof message.params === 'object' ? message.params : {}
  record({
    method,
    ...(method === 'tools/call' ? {
      name: typeof params.name === 'string' ? params.name : '',
      text: params.arguments && typeof params.arguments.text === 'string' ? params.arguments.text : '',
    } : {}),
  })
  if (!Object.hasOwn(message, 'id')) return
  if (method === 'initialize') {
    respond(message.id, {
      protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'claude-asset-e2e-mcp', version: '1.0.0' },
    })
    return
  }
  if (method === 'ping') {
    respond(message.id, {})
    return
  }
  if (method === 'tools/list') {
    respond(message.id, {
      tools: [{
        name: 'asset_echo',
        description: 'Returns the exact text supplied by the caller with a fixture prefix.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false,
        },
      }],
    })
    return
  }
  if (method === 'tools/call') {
    if (params.name !== 'asset_echo' || params.arguments?.text !== '${MCP_INPUT}') {
      fail(message.id, -32602, 'asset_echo requires the expected fixture input')
      return
    }
    respond(message.id, {
      content: [{ type: 'text', text: '${MCP_RESULT}' }],
      isError: false,
    })
    return
  }
  fail(message.id, -32601, 'method not found')
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  input += chunk
  while (true) {
    const newline = input.indexOf('\n')
    if (newline < 0) break
    const line = input.slice(0, newline)
    input = input.slice(newline + 1)
    if (line.trim().length === 0) continue
    try {
      handle(JSON.parse(line))
    } catch {
      // A malformed frame cannot be answered safely; keep stdout MCP-clean.
    }
  }
})
process.stdin.on('end', () => process.exit(0))
`

const PLUGIN_MANIFEST = JSON.stringify({
  name: 'claude-asset-e2e-plugin',
  version: '1.0.0',
  description: 'Minimal local plugin used only by the Claude assets E2E.',
}, null, 2) + '\n'

const SKILL_SOURCE = `---\nname: ${SKILL_NAME}\ndescription: Return the fixed verification marker.\n---\n\nReply with exactly ${SKILL_RESPONSE}.\n`

function createSession(
  config: RealConfig,
  cwd: string,
  configDir: string,
  mcpServerPath: string,
  auditPath: string,
  pluginDir: string,
): ClaudeAgentSession {
  const queryFactory: ClaudeQueryFactory = ({ prompt, options }) => sdkQuery({ prompt, options })
  const permissionHandler = async (request: Parameters<NonNullable<Parameters<typeof createClaudeProviderSession>[0]['permissionHandler']>>[0]): Promise<ClaudePermissionHandlerResult> => {
    if (request.toolName === 'Skill' || request.toolName === 'mcp__asset-fixture__asset_echo') return { behavior: 'allow' }
    return { behavior: 'deny', message: 'The assets E2E permits only Skill and the fixture MCP tool.' }
  }
  return createClaudeProviderSession({
    cwd,
    model: config.model,
    baseUri: config.baseUri,
    authToken: config.authToken,
    executablePath: config.executable,
    permissionMode: 'default',
    persistSession: true,
    environment: { CLAUDE_CONFIG_DIR: configDir, ANTHROPIC_API_KEY: '' },
    mcpAssets: {
      scope: 'user',
      servers: [{
        name: 'asset-fixture',
        transport: 'stdio',
        command: process.execPath,
        args: [mcpServerPath],
        env: { MCP_FIXTURE_AUDIT_PATH: auditPath },
        alwaysLoad: true,
      }],
    },
    skillAssets: { scope: 'user', pluginDirs: [pluginDir] },
    queryFactory,
    permissionHandler,
  })
}

async function runTurn(session: ClaudeAgentSession, prompt: string): Promise<TurnObservation> {
  let firstToken = false
  let mcpToolCall = false
  let mcpToolResult = false
  const permissionRequestTools = new Map<string, string>()
  const permissionDecisions = new Map<string, 'allow' | 'deny' | 'unknown'>()
  const events: ClaudeAdapterEvent[] = []
  const off = session.subscribe((event: ClaudeAdapterEvent) => {
    events.push(event)
    if (event.type === 'timeline' && event.item.type === 'assistant_message' && event.item.partial === true && (event.item.text?.length ?? 0) > 0) firstToken = true
    if (event.type === 'timeline' && event.item.type === 'tool_call' && event.item.name?.includes('asset_echo')) mcpToolCall = true
    if (event.type === 'timeline' && event.item.type === 'tool_result' && event.item.output?.includes(MCP_RESULT)) mcpToolResult = true
    if (event.type === 'permission_requested') permissionRequestTools.set(event.request.requestId, event.request.toolName)
    if (event.type === 'permission_resolved') permissionDecisions.set(event.requestId, event.decision.behavior === 'allow' ? 'allow' : event.decision.behavior === 'deny' ? 'deny' : 'unknown')
  })
  try {
    const result = await withTimeout(session.run(prompt), 'Claude assets turn', TURN_TIMEOUT_MS)
    const permissionIds = [...permissionRequestTools.keys()]
    const permissionResolved = permissionIds.length > 0
      && permissionIds.every(requestId => permissionDecisions.get(requestId) === 'allow')
      && session.pendingPermissions().length === 0
    return {
      finalText: result.finalText,
      firstToken,
      mcpToolCall,
      mcpToolResult,
      permissionRequested: permissionIds.length > 0,
      permissionResolved,
      permissionTools: [...permissionRequestTools.values()],
      events,
    }
  } finally {
    off()
  }
}

const preflight = readConfig()

test('Claude real MCP + local Skill assets E2E (opt-in, GLM-only)', { skip: preflight.skip }, async () => {
  if (preflight.reject) throw new Error(preflight.reject)
  const config = preflight.config
  assert.ok(config)

  const cli = spawnSync(config.executable, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  })
  if (cli.error) throw new Error(`local Claude CLI precondition failed: ${safeError(cli.error, config.authToken)}`)
  if (cli.status !== 0) throw new Error(`local Claude CLI precondition failed: exit ${cli.status ?? 'unknown'}`)

  const provider = await preflightClaudeProvider({
    baseUri: config.baseUri,
    authToken: config.authToken,
    model: config.model,
    timeoutMs: PROVIDER_PREFLIGHT_TIMEOUT_MS,
  })
  if (!provider.ok) throw new Error(`[external-provider:${provider.kind}] ${provider.message}`)

  const root = await mkdtemp(join(tmpdir(), 'dsh-claude-assets-real-'))
  const cwd = join(root, 'cwd')
  const configDir = join(root, 'claude-config')
  const pluginDir = join(root, 'plugin')
  const skillDir = join(pluginDir, 'skills', SKILL_NAME)
  const mcpServerPath = join(root, 'mcp-server.mjs')
  const auditPath = join(root, 'mcp-audit.jsonl')
  await mkdir(cwd, { recursive: true })
  await mkdir(configDir, { recursive: true })
  await mkdir(join(pluginDir, '.claude-plugin'), { recursive: true })
  await mkdir(skillDir, { recursive: true })
  await writeFile(mcpServerPath, MCP_SERVER_SOURCE, 'utf8')
  await writeFile(join(pluginDir, '.claude-plugin', 'plugin.json'), PLUGIN_MANIFEST, 'utf8')
  await writeFile(join(skillDir, 'SKILL.md'), SKILL_SOURCE, 'utf8')

  let session: ClaudeAgentSession | undefined
  try {
    session = createSession(config, cwd, configDir, mcpServerPath, auditPath, pluginDir)
    const readiness = session.whenReady?.()
    if (readiness === undefined) throw new Error('Claude session has no readiness gate')
    await withTimeout(readiness, 'Claude assets initialization', INITIALIZATION_TIMEOUT_MS)

    const catalog = await withTimeout(session.refreshCatalog(), 'Claude assets catalog refresh', INITIALIZATION_TIMEOUT_MS)
    const skillCommand = catalog.commands.find(command => command.name === SKILL_NAME || command.name.endsWith(`:${SKILL_NAME}`))
    assert.ok(skillCommand, `local skill command ${SKILL_NAME} was not returned by supportedCommands()`)

    const mcpTurn = await runTurn(session, `Use the local MCP server asset-fixture. Call its asset_echo tool exactly once with the text ${MCP_INPUT}. Do not use any other tool. After the tool returns, reply with exactly ${MCP_RESPONSE}.`)
    const auditEntries = await readAudit(auditPath)
    const diagnostics = `finalText=${JSON.stringify(mcpTurn.finalText)} events=${JSON.stringify(mcpTurn.events)} audit=${JSON.stringify(auditEntries)}`
    assert.equal(mcpTurn.firstToken, true, `MCP turn did not emit a partial assistant token; ${diagnostics}`)
    assert.equal(mcpTurn.mcpToolCall, true, `the model did not call the fixture MCP tool; ${diagnostics}`)
    assert.equal(mcpTurn.mcpToolResult, true, `the fixture MCP tool result was not observed; ${diagnostics}`)
    assert.equal(mcpTurn.permissionRequested, true, `the fixture MCP permission callback was not requested; ${diagnostics}`)
    assert.deepEqual(mcpTurn.permissionTools, ['mcp__asset-fixture__asset_echo'], `an unexpected permission target was observed; ${diagnostics}`)
    assert.equal(mcpTurn.permissionResolved, true, `the fixture MCP permission was not resolved as allow; ${diagnostics}`)
    assert.equal(mcpTurn.finalText.includes(MCP_RESPONSE), true, `the final response did not contain the fixture MCP result marker; ${diagnostics}`)

    const methods = auditEntries.map(entry => entry.method)
    assert.equal(methods.includes('initialize'), true, 'fixture MCP server did not receive initialize')
    assert.equal(methods.includes('tools/list'), true, 'fixture MCP server did not receive tools/list')
    assert.equal(methods.includes('tools/call'), true, 'fixture MCP server did not receive tools/call')
    const calls = auditEntries.filter(entry => entry.method === 'tools/call')
    assert.equal(calls.length, 1, 'fixture MCP tool was not called exactly once')
    assert.deepEqual(calls[0], { method: 'tools/call', name: 'asset_echo', text: MCP_INPUT })

    const skillTurn = await runTurn(session, `/${skillCommand.name}`)
    const skillDiagnostics = `finalText=${JSON.stringify(skillTurn.finalText)} events=${JSON.stringify(skillTurn.events)}`
    assert.equal(skillTurn.finalText.includes(SKILL_RESPONSE), true, `the model did not load and follow the local Skill command; ${skillDiagnostics}`)

    await session.close()
    await session.close()
    session = undefined
    assert.equal(await containsSecret(root, config.authToken), false, 'the auth token was written to a temporary runtime file')
  } catch (error) {
    throw new Error(safeError(error, config.authToken))
  } finally {
    await session?.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})
