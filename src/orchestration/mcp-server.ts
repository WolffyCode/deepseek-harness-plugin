import { createInterface } from 'node:readline'

interface JsonRpcRequest {
  readonly jsonrpc?: string
  readonly id?: string | number
  readonly method?: string
  readonly params?: unknown
}

const args = process.argv.slice(2)
const urlFromArgs = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const bridgeUrl = urlFromArgs('--url') ?? process.env['DSH_ENGINE_SUITE_BRIDGE_URL']
const parentSessionId = urlFromArgs('--parent-session') ?? process.env['DSH_ENGINE_SUITE_PARENT_SESSION']
const token = process.env['DSH_ENGINE_SUITE_BRIDGE_TOKEN']

function send(id: string | number | undefined, result: unknown, error?: unknown): void {
  const response = error === undefined
    ? { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), result }
    : { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), error: { code: -32000, message: error instanceof Error ? error.message : String(error) } }
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

async function delegate(value: unknown): Promise<{ readonly content: readonly [{ readonly type: 'text'; readonly text: string }]; readonly isError?: boolean }> {
  if (bridgeUrl === undefined || parentSessionId === undefined || token === undefined) throw new Error('Engine Suite child bridge environment is incomplete')
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('tool arguments must be an object')
  const args = value as Record<string, unknown>
  if (typeof args['profileId'] !== 'string' || args['profileId'].trim() === '') throw new Error('profileId is required')
  if (typeof args['task'] !== 'string' || args['task'].trim() === '') throw new Error('task is required')
  const response = await fetch(`${bridgeUrl}/delegate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-engine-suite-token': token },
    body: JSON.stringify({ parentSessionId, profileId: args['profileId'], task: args['task'] }),
  })
  const payload = await response.json() as { ok?: boolean; value?: { childSessionId: string; text: string }; error?: string }
  if (!response.ok || payload.ok !== true || payload.value === undefined) throw new Error(payload.error ?? `child bridge returned HTTP ${response.status}`)
  return { content: [{ type: 'text', text: JSON.stringify(payload.value) }] }
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
