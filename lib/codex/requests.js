import { CallId } from '@deepseek-ai/dsh-llm';
function object(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
function decisions(params) {
    const value = params?.['availableDecisions'];
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}
function decline(params) {
    const available = decisions(params);
    return available.includes('cancel') ? 'cancel' : 'decline';
}
function accept(params) {
    const available = decisions(params);
    if (available.includes('accept'))
        return 'accept';
    if (available.includes('acceptForSession'))
        return 'acceptForSession';
    return decline(params);
}
function callIdOf(params) {
    const value = params?.['itemId'];
    return typeof value === 'string' && value.length > 0 ? CallId(value) : undefined;
}
function reasonOf(params) {
    const reason = params?.['reason'];
    return typeof reason === 'string' && reason.length > 0 ? reason : undefined;
}
/** Bridges Codex app-server requests into the host's approval seam without exposing CLI credentials. */
export function createCodexServerRequestHandler(options) {
    return async (method, rawParams) => {
        const params = object(rawParams);
        if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
            const agent = options.agent();
            if (options.approval === undefined || agent === undefined)
                return { decision: decline(params) };
            const reason = reasonOf(params);
            const callId = callIdOf(params);
            const outcome = await options.approval.request({
                agent,
                toolName: method === 'item/fileChange/requestApproval' ? 'file_change' : 'command_execution',
                ...callId === undefined ? {} : { callId },
                ...reason === undefined ? {} : { reason },
            });
            return { decision: outcome === 'allowed-once' ? accept(params) : outcome === 'cancelled' ? 'cancel' : decline(params) };
        }
        if (method === 'item/permissions/requestApproval')
            return { permissions: {}, scope: 'turn' };
        if (method === 'item/tool/requestUserInput')
            return { answers: {} };
        if (method === 'mcpServer/elicitation/request')
            return { action: 'decline', content: null, _meta: null };
        throw new Error(`unsupported Codex app-server request: ${method}`);
    };
}
//# sourceMappingURL=requests.js.map