import { forkSession as claudeForkSession } from "@anthropic-ai/claude-agent-sdk";
export const realClaudeRewindSdk = { forkSession: claudeForkSession };
function id(value, name) { if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${name} must be non-empty`); return value.trim(); }
export async function rewindClaude(input) {
    const messageId = id((await input.resolveMessageId?.(input.messageId)) ?? input.messageId, "messageId");
    const conversationWrite = input.mode !== "files" && input.dryRun !== true;
    if (conversationWrite && !input.sdk)
        throw new TypeError("sdk is required");
    if (input.mode !== "conversation" && !input.query)
        throw new TypeError("query is required");
    let files;
    if (input.mode !== "conversation") {
        files = await input.query.rewindFiles(messageId, { dryRun: input.dryRun ?? false });
        if (!files.canRewind)
            throw new Error(files.error ?? `Cannot rewind files at ${messageId}`);
    }
    if (!conversationWrite)
        return { mode: input.mode, messageId, ...(files === undefined ? {} : { files }) };
    let sessionId;
    if (input.mode !== "files") {
        const source = id(input.sessionId ?? "", "sessionId");
        const fork = await input.sdk.forkSession(source, { upToMessageId: messageId });
        sessionId = id(fork.sessionId, "forked sessionId");
        input.setSessionId?.(sessionId);
    }
    return { mode: input.mode, messageId, ...(files === undefined ? {} : { files }), ...(sessionId === undefined ? {} : { sessionId }) };
}
//# sourceMappingURL=rewind.js.map