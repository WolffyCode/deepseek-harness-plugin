import type { Session } from '@deepseek-ai/dsh-session'

export type WorkspacePermissionPreset = 'read-only' | 'workspace-write' | 'danger-full-access'
export type ClaudePermissionMode = 'plan' | 'acceptEdits' | 'bypassPermissions'

function isWorkspacePermissionPreset(value: unknown): value is WorkspacePermissionPreset {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access'
}

/** Read the latest host permission fact without importing or changing Harness internals. */
export function latestWorkspacePermission(session: Pick<Session, 'events'> | undefined): WorkspacePermissionPreset | undefined {
  if (session === undefined) return undefined
  for (let index = session.events.length - 1; index >= 0; index--) {
    const event: unknown = session.events[index]
    if (typeof event !== 'object' || event === null || Array.isArray(event)) continue
    const eventRecord = event as Record<string, unknown>
    if (eventRecord['type'] !== 'permission/preset') continue
    const data = eventRecord['data']
    const preset = typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>)['preset'] : undefined
    return isWorkspacePermissionPreset(preset) ? preset : undefined
  }
  return undefined
}

export function claudePermissionMode(preset: string | undefined): ClaudePermissionMode | undefined {
  if (preset === 'read-only') return 'plan'
  if (preset === 'workspace-write') return 'acceptEdits'
  if (preset === 'danger-full-access') return 'bypassPermissions'
  return undefined
}

export function codexPermissionPolicy(preset: string | undefined): {
  readonly approvalPolicy?: 'on-request' | 'never'
  readonly sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
} {
  if (preset === 'read-only') return { approvalPolicy: 'on-request', sandbox: 'read-only' }
  if (preset === 'workspace-write') return { approvalPolicy: 'on-request', sandbox: 'workspace-write' }
  if (preset === 'danger-full-access') return { approvalPolicy: 'never', sandbox: 'danger-full-access' }
  return {}
}
