import { CallId } from '@deepseek-ai/dsh-llm';
export class CodexApprovalUnavailableError extends Error {
    code = 'CODEX_APPROVAL_UNAVAILABLE';
    method;
    toolName;
    itemId;
    threadId;
    turnId;
    constructor(request) {
        const scope = request.itemId === undefined ? '' : ` for item ${request.itemId}`;
        super(`Codex ${request.toolName} approval is unavailable${scope}`);
        this.name = 'CodexApprovalUnavailableError';
        this.method = request.method;
        this.toolName = request.toolName;
        if (request.itemId !== undefined)
            this.itemId = request.itemId;
        if (request.threadId !== undefined)
            this.threadId = request.threadId;
        if (request.turnId !== undefined)
            this.turnId = request.turnId;
    }
}
export class CodexUnsupportedServerRequestError extends Error {
    code = 'CODEX_UNSUPPORTED_SERVER_REQUEST';
    method;
    constructor(method) {
        super(`unsupported Codex app-server request: ${method}`);
        this.name = 'CodexUnsupportedServerRequestError';
        this.method = method;
    }
}
function object(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
function stringField(params, key) {
    const value = params?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function identifierField(params, key) {
    const value = params?.[key];
    return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value)) ? value : undefined;
}
function decisions(params) {
    const value = params?.['availableDecisions'];
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}
function declineDecision(params) {
    const available = decisions(params);
    if (available.length === 0 || available.includes('decline'))
        return 'decline';
    if (available.includes('cancel'))
        return 'cancel';
    return 'decline';
}
function acceptDecision(params) {
    const available = decisions(params);
    if (available.length === 0 || available.includes('accept'))
        return 'accept';
    if (available.includes('acceptForSession'))
        return 'acceptForSession';
    // An approval outcome cannot be represented by an unavailable accept choice.
    // Decline is the only non-approving V2 decision that is safe to send here.
    return 'decline';
}
function cancelDecision(params) {
    const available = decisions(params);
    if (available.length === 0 || available.includes('cancel'))
        return 'cancel';
    return declineDecision(params);
}
function contextOf(method, params) {
    if (params === undefined)
        return undefined;
    const fields = method === 'item/commandExecution/requestApproval'
        ? [
            'command',
            'cwd',
            'commandActions',
            'kind',
            'approvalId',
            'environmentId',
            'networkApprovalContext',
            'additionalPermissions',
            'proposedExecpolicyAmendment',
            'proposedNetworkPolicyAmendments',
        ]
        : [
            'grantRoot',
            'fileChanges',
            'changes',
            'path',
            'paths',
        ];
    const context = {};
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(params, field))
            context[field] = params[field];
    }
    return Object.keys(context).length === 0 ? undefined : context;
}
function approvalRequest(method, agent, params) {
    const itemId = stringField(params, 'itemId');
    const requestId = identifierField(params, 'requestId');
    const threadId = stringField(params, 'threadId');
    const turnId = stringField(params, 'turnId');
    const reason = stringField(params, 'reason');
    const context = contextOf(method, params);
    const request = {
        agent,
        toolName: method === 'item/fileChange/requestApproval' ? 'file_change' : 'command_execution',
        ...requestId === undefined ? {} : { requestId },
        ...itemId === undefined ? {} : { itemId, callId: CallId(itemId) },
        ...threadId === undefined ? {} : { threadId },
        ...turnId === undefined ? {} : { turnId },
        ...reason === undefined ? {} : { reason },
        ...context === undefined ? {} : { context },
    };
    return request;
}
function unavailable(method, request) {
    return new CodexApprovalUnavailableError({
        method,
        toolName: request.toolName,
        ...request.itemId === undefined ? {} : { itemId: request.itemId },
        ...request.threadId === undefined ? {} : { threadId: request.threadId },
        ...request.turnId === undefined ? {} : { turnId: request.turnId },
    });
}
/** Bridges Codex app-server requests into the host's approval seam without exposing CLI credentials. */
export function createCodexServerRequestHandler(options) {
    return async (method, rawParams) => {
        const params = object(rawParams);
        if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
            const agent = options.agent();
            const request = approvalRequest(method, agent, params);
            if (options.approval === undefined || agent === undefined)
                throw unavailable(method, request);
            const outcome = await options.approval.request(request);
            if (outcome === 'allowed-once')
                return { decision: acceptDecision(params) };
            if (outcome === 'rejected')
                return { decision: declineDecision(params) };
            if (outcome === 'cancelled')
                return { decision: cancelDecision(params) };
            if (outcome === 'unavailable')
                throw unavailable(method, request);
            throw new Error(`invalid Codex approval outcome for ${method}`);
        }
        if (method === 'item/permissions/requestApproval')
            return { permissions: {}, scope: 'turn' };
        if (method === 'item/tool/requestUserInput')
            return { answers: {} };
        if (method === 'mcpServer/elicitation/request')
            return { action: 'decline', content: null, _meta: null };
        throw new CodexUnsupportedServerRequestError(method);
    };
}
//# sourceMappingURL=requests.js.map