import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface EngineSuiteChildBridgeRequest {
  readonly parentSessionId: string
  readonly profileId: string
  readonly task: string
  readonly nativeTaskId?: string
}

export interface EngineSuiteChildBridgeResult {
  readonly childSessionId: string
  readonly text: string
}

export type EngineSuiteChildBridgeHandler = (
  request: EngineSuiteChildBridgeRequest,
) => Promise<EngineSuiteChildBridgeResult>

export interface EngineSuiteChildBridgeLaunch {
  readonly serverUrl: string
  readonly token: string
  readonly environment: Readonly<Record<string, string>>
  readonly mcpServer: {
    readonly id: string
    readonly name: string
    readonly transport: 'stdio'
    readonly command: string
    readonly args: readonly string[]
  }
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.setHeader('content-length', Buffer.byteLength(body))
  response.end(body)
}

async function body(request: IncomingMessage): Promise<unknown> {
  let value = ''
  for await (const chunk of request) {
    value += String(chunk)
    if (Buffer.byteLength(value) > 256 * 1024) throw new Error('child bridge request is too large')
  }
  return JSON.parse(value) as unknown
}

function requestRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('child bridge request must be an object')
  return value as Record<string, unknown>
}

function textField(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

function authorized(candidate: string | undefined, token: string): boolean {
  if (candidate === undefined) return false
  const left = Buffer.from(candidate)
  const right = Buffer.from(token)
  return left.length === right.length && timingSafeEqual(left, right)
}

function mcpServerModule(): { readonly command: string; readonly args: readonly string[] } {
  const modulePath = fileURLToPath(new URL('./mcp-server.js', import.meta.url))
  if (existsSync(modulePath)) return { command: process.execPath, args: [modulePath, '--stdio'] }
  const sourcePath = join(dirname(modulePath), 'mcp-server.ts')
  return { command: process.execPath, args: ['--import', 'tsx', sourcePath, '--stdio'] }
}

/** Local-only HTTP control plane used by CLI-native MCP child delegation. */
export class EngineSuiteChildBridge {
  private readonly token = crypto.randomUUID()
  private readonly server = createServer((request, response) => { void this.handle(request, response) })
  private address: string | undefined
  private started: Promise<void> | undefined

  constructor(private readonly handler: EngineSuiteChildBridgeHandler) {}

  async start(): Promise<void> {
    if (this.started !== undefined) return this.started
    this.started = new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject)
        const address = this.server.address()
        if (address === null || typeof address === 'string') {
          reject(new Error('child bridge did not receive a TCP address'))
          return
        }
        this.address = `http://127.0.0.1:${address.port}`
        this.server.unref()
        resolve()
      })
    })
    return this.started
  }

  async close(): Promise<void> {
    if (this.started === undefined) return
    await this.started.catch(() => {})
    if (!this.server.listening) return
    await new Promise<void>(resolve => this.server.close(() => resolve()))
  }

  launchFor(parentSessionId: string): EngineSuiteChildBridgeLaunch {
    if (this.address === undefined) throw new Error('child bridge has not started')
    const server = mcpServerModule()
    return {
      serverUrl: this.address,
      token: this.token,
      environment: {
        DSH_ENGINE_SUITE_BRIDGE_URL: this.address,
        DSH_ENGINE_SUITE_BRIDGE_TOKEN: this.token,
        DSH_ENGINE_SUITE_PARENT_SESSION: parentSessionId,
      },
      mcpServer: {
        id: 'engine-suite-delegate',
        name: 'Engine Suite Child Agent Delegation',
        transport: 'stdio',
        command: server.command,
        args: [...server.args, '--parent-session', parentSessionId, '--url', this.address],
      },
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST' || request.url !== '/delegate') {
      json(response, 404, { error: 'not found' })
      return
    }
    try {
      if (!authorized(request.headers['x-dsh-engine-suite-token']?.toString(), this.token)) {
        json(response, 401, { error: 'unauthorized' })
        return
      }
      const value = requestRecord(await body(request))
      const parsed: EngineSuiteChildBridgeRequest = {
        parentSessionId: textField(value['parentSessionId'], 'parentSessionId'),
        profileId: textField(value['profileId'], 'profileId'),
        task: textField(value['task'], 'task'),
        ...(value['nativeTaskId'] === undefined ? {} : { nativeTaskId: textField(value['nativeTaskId'], 'nativeTaskId') }),
      }
      json(response, 200, { ok: true, value: await this.handler(parsed) })
    } catch (error: unknown) {
      json(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}
