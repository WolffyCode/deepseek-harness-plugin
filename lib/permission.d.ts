import type { Session } from '@deepseek-ai/dsh-session';
export type WorkspacePermissionPreset = 'read-only' | 'workspace-write' | 'danger-full-access';
export type ClaudePermissionMode = 'plan' | 'acceptEdits' | 'bypassPermissions';
/** Read the latest host permission fact without importing or changing Harness internals. */
export declare function latestWorkspacePermission(session: Pick<Session, 'events'> | undefined): WorkspacePermissionPreset | undefined;
export declare function claudePermissionMode(preset: string | undefined): ClaudePermissionMode | undefined;
export declare function codexPermissionPolicy(preset: string | undefined): {
    readonly approvalPolicy?: 'on-request' | 'never';
    readonly sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
};
//# sourceMappingURL=permission.d.ts.map