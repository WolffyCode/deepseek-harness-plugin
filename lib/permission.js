function isWorkspacePermissionPreset(value) {
    return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access';
}
/** Read the latest host permission fact without importing or changing Harness internals. */
export function latestWorkspacePermission(session) {
    if (session === undefined)
        return undefined;
    for (let index = session.events.length - 1; index >= 0; index--) {
        const event = session.events[index];
        if (typeof event !== 'object' || event === null || Array.isArray(event))
            continue;
        const eventRecord = event;
        if (eventRecord['type'] !== 'permission/preset')
            continue;
        const data = eventRecord['data'];
        const preset = typeof data === 'object' && data !== null && !Array.isArray(data) ? data['preset'] : undefined;
        return isWorkspacePermissionPreset(preset) ? preset : undefined;
    }
    return undefined;
}
export function claudePermissionMode(preset) {
    if (preset === 'read-only')
        return 'plan';
    if (preset === 'workspace-write')
        return 'acceptEdits';
    if (preset === 'danger-full-access')
        return 'bypassPermissions';
    return undefined;
}
export function codexPermissionPolicy(preset) {
    if (preset === 'read-only')
        return { approvalPolicy: 'on-request', sandbox: 'read-only' };
    if (preset === 'workspace-write')
        return { approvalPolicy: 'on-request', sandbox: 'workspace-write' };
    if (preset === 'danger-full-access')
        return { approvalPolicy: 'never', sandbox: 'danger-full-access' };
    return {};
}
//# sourceMappingURL=permission.js.map