import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { ClaudeProviderSession } from './session.js'
import type {
  ClaudeAdapterOptions,
  ClaudeAgentSession,
  ClaudeProviderClient,
} from './types.js'

export * from './types.js'
export { ClaudeProviderSession } from './session.js'
export { ClaudeSdkTransport } from './transport.js'
export type { ClaudeTransport, ClaudeTransportEvent } from './transport.js'

export function createClaudeProviderClient(): ClaudeProviderClient {
  return new ClaudeClient()
}

export function createClaudeProviderSession(options: ClaudeAdapterOptions): ClaudeProviderSession {
  return new ClaudeProviderSession(options)
}

class ClaudeClient implements ClaudeProviderClient {
  readonly engineId = 'claude-cli' as const

  createSession(options: ClaudeAdapterOptions): ClaudeAgentSession {
    return new ClaudeProviderSession(options)
  }

  resumeSession(options: ClaudeAdapterOptions & { readonly resumeSessionId: string }): ClaudeAgentSession {
    return new ClaudeProviderSession(options)
  }

  async isAvailable(): Promise<boolean> {
    const executable = process.env['CLAUDE_CODE_EXECUTABLE'] ?? 'claude'
    if (executable === 'claude') return true
    try {
      await access(executable, constants.X_OK)
      return true
    } catch {
      return false
    }
  }
}
