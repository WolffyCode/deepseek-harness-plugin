import test from 'node:test'
import assert from 'node:assert/strict'
import { claudePermissionMode, codexPermissionPolicy, latestWorkspacePermission } from '../src/permission.js'

test('workspace permissions map to CLI-specific policies', () => {
  assert.equal(claudePermissionMode('read-only'), 'plan')
  assert.equal(claudePermissionMode('workspace-write'), 'acceptEdits')
  assert.equal(claudePermissionMode('danger-full-access'), 'bypassPermissions')
  assert.deepEqual(codexPermissionPolicy('read-only'), { approvalPolicy: 'on-request', sandbox: 'read-only' })
  assert.deepEqual(codexPermissionPolicy('workspace-write'), { approvalPolicy: 'on-request', sandbox: 'workspace-write' })
  assert.deepEqual(codexPermissionPolicy('danger-full-access'), { approvalPolicy: 'never', sandbox: 'danger-full-access' })
})

test('latest workspace permission is read from the session event tail', () => {
  const session = {
    events: [
      { type: 'permission/preset', data: { preset: 'read-only' } },
      { type: 'permission/preset', data: { preset: 'workspace-write' } },
    ],
  } as never
  assert.equal(latestWorkspacePermission(session), 'workspace-write')
  assert.equal(latestWorkspacePermission(undefined), undefined)
})
