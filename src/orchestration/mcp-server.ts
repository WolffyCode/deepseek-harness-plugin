import { createInterface } from 'node:readline'

interface JsonRpcRequest {
  readonly jsonrpc?: string
  readonly id?: string | number
  readonly method?: string
  readonly params?: unknown
}

interface BridgeResult {
  readonly childSessionId: string
  readonly text: string
  readonly nativeTaskId?: string
}

const args = process.argv.slice(2)
const urlFromArgs = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const bridgeUrl = urlFromArgs('--url') ?? process.env['DSH_ENGINE_SUITE_BRIDGE_URL']
const parentSessionId = urlFromArgs('--parent-session') ?? process.env['DSH_ENGINE_SUITE_PARENT_SESSION']
const token = process.env['DSH_ENGINE_SUITE_BRIDGE_TOKEN']

// The MCP helper only needs the bridge tuple. Remove inherited provider credentials
// before handling any request so a child tool cannot forward them accidentally.
for (const key of Object.keys(process.env)) {
  if (key === 'DSH_ENGINE_SUITE_BRIDGE_TOKEN' || key === 'DSH_ENGINE_SUITE_BRIDGE_URL' || key === 'DSH_ENGINE_SUITE_PARENT_SESSION') continue
  if (key === 'OPENAI_API_KEY' || key === 'ANTHROPIC_API_KEY' || key === 'ANTHROPIC_AUTH_TOKEN' || key.startsWith('DSH_DEBUG_') || /(key|token|secret|password|credential)/iu.test(key)) {
    delete process.env[key]
  }
}

function send(id: string | number | undefined, result: unknown, error?: unknown): void {
  const response = error === undefined
    ? { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), result }
    : { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), error: { code: -32000, message: error instanceof Error ? error.message : String(error) } }
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

function localBridgeUrl(value: string | undefined): string {
  if (value === undefined) throw new Error('Engine Suite child bridge URL is missing')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Engine Suite child bridge URL is invalid') }
  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== '::1') || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('Engine Suite child bridge must use a loopback HTTP URL')
  }
  return url.toString().replace(/\/$/u, '')
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required`)
  return value.trim()
}

async function delegate(value: unknown): Promise<{ readonly content: readonly [{ readonly type: 'text'; readonly text: string }]; readonly isError?: boolean }> {
  const url = localBridgeUrl(bridgeUrl)
  const parent = text(parentSessionId, 'parentSessionId')
  if (token === undefined || token.length === 0) throw new Error('Engine Suite child bridge token is missing')
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('tool arguments must be an object')
  const toolArgs = value as Record<string, unknown>
  const allowed = new Set(['profileId', 'task', 'nativeTaskId'])
  for (const key of Object.keys(toolArgs)) if (!allowed.has(key)) throw new Error(`unsupported delegation field: ${key}`)
  const profileId = text(toolArgs['profileId'], 'profileId')
  const task = text(toolArgs['task'], 'task')
  const nativeTaskId = toolArgs['nativeTaskId'] === undefined ? undefined : text(toolArgs['nativeTaskId'], 'nativeTaskId')
  const response = await fetch(`${url}/delegate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-engine-suite-token': token },
    body: JSON.stringify({ parentSessionId: parent, profileId, task, ...(nativeTaskId === undefined ? {} : { nativeTaskId }) }),
  })
  let payload: { ok?: boolean; value?: BridgeResult; error?: string }
  try { payload = await response.json() as { ok?: boolean; value?: BridgeResult; error?: string } } catch { throw new Error(`child bridge returned HTTP ${response.status}`) }
  if (!response.ok || payload.ok !== true || payload.value === undefined) throw new Error(payload.error ?? `child bridge returned HTTP ${response.status}`)
  const result: BridgeResult = {
    childSessionId: text(payload.value.childSessionId, 'childSessionId'),
    text: typeof payload.value.text === 'string' ? payload.value.text : '',
    ...(payload.value.nativeTaskId === undefined ? {} : { nativeTaskId: text(payload.value.nativeTaskId, 'nativeTaskId') }),
  }
  return { content: [{ type: 'text', text: JSON.stringify(result) }] }
}

const tools = [{
  name: 'engine_suite_delegate',
  description: 'Delegate a bounded task to an authorized Engine Suite child Agent profile. The child may use a different local CLI engine.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['profileId', 'task'],
    properties: {
      profileId: { type: 'string', description: 'Authorized Engine Suite profile id.' },
      task: { type: 'string', description: 'Task for the child Agent.' },
      nativeTaskId: { type: 'string', description: 'Optional caller-supplied trace id for this child task.' },
    },
  },
}]

const rl = createInterface({ input: process.stdin })
rl.on('line', line => {
  void (async () => {
    let request: JsonRpcRequest
    try { request = JSON.parse(line) as JsonRpcRequest } catch (error: unknown) { send(undefined, undefined, error); return }
    const method = request.method
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return
    if (method === 'initialize') {
      send(request.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'dsh-engine-suite-child-bridge', version: '0.1.0' },
      })
      return
    }
    if (method === 'ping') { send(request.id, {}); return }
    if (method === 'tools/list') { send(request.id, { tools }); return }
    if (method === 'tools/call') {
      const params = typeof request.params === 'object' && request.params !== null && !Array.isArray(request.params)
        ? request.params as Record<string, unknown>
        : {}
      if (params['name'] !== 'engine_suite_delegate') throw new Error(`unknown tool: ${String(params['name'])}`)
      const result = await delegate(params['arguments'])
      send(request.id, result)
      return
    }
    send(request.id, undefined, new Error(`unsupported MCP method: ${String(method)}`))
  })().catch(error => send(requestIdFromLine(line), undefined, error))
})

function requestIdFromLine(line: string): string | number | undefined {
  try { return (JSON.parse(line) as JsonRpcRequest).id } catch { return undefined }
}
