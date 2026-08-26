/** Maps Claude stream-json can_use_tool requests to the Harness approval seam. */
export function createClaudeControlRequestHandler(options) {
    return async (request) => {
        const agent = options.agent();
        if (options.approval === undefined || agent === undefined) {
            return { behavior: 'deny', message: 'No Harness approval service is available' };
        }
        const outcome = await options.approval.request({
            agent,
            toolName: request.toolName,
            ...request.reason === undefined ? {} : { reason: request.reason },
        });
        if (outcome === 'allowed-once')
            return { behavior: 'allow', updatedInput: request.input };
        return { behavior: 'deny', message: outcome === 'cancelled' ? 'User cancelled this tool request' : 'User rejected this tool request' };
    };
}
//# sourceMappingURL=requests.js.map