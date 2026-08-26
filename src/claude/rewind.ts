import { forkSession as claudeForkSession, type Query } from "@anthropic-ai/claude-agent-sdk";

export interface ClaudeRewindSdk { forkSession(sessionId: string, options: { upToMessageId: string }): Promise<{ sessionId: string }>; }
export const realClaudeRewindSdk: ClaudeRewindSdk = { forkSession: claudeForkSession };
export type RewindMode = "conversation" | "files" | "both";
export interface RewindInput { mode: RewindMode; sessionId?: string | null; messageId: string; dryRun?: boolean; sdk?: ClaudeRewindSdk; query?: Pick<Query, "rewindFiles">; resolveMessageId?: (id: string) => string | Promise<string>; setSessionId?: (id: string) => void; }
export interface RewindResult { mode: RewindMode; messageId: string; files?: Awaited<ReturnType<Query["rewindFiles"]>>; sessionId?: string; }
function id(value: string, name: string): string { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be non-empty`); return value.trim(); }
export async function rewindClaude(input: RewindInput): Promise<RewindResult> {
  const messageId = id((await input.resolveMessageId?.(input.messageId)) ?? input.messageId, "messageId");
  const conversationWrite = input.mode !== "files" && input.dryRun !== true;
  if (conversationWrite && !input.sdk) throw new TypeError("sdk is required");
  if (input.mode !== "conversation" && !input.query) throw new TypeError("query is required");
  let files: RewindResult["files"];
  if (input.mode !== "conversation") { files = await input.query!.rewindFiles(messageId, { dryRun: input.dryRun ?? false }); if (!files.canRewind) throw new Error(files.error ?? `Cannot rewind files at ${messageId}`); }
  if (!conversationWrite) return { mode: input.mode, messageId, ...(files === undefined ? {} : { files }) };
  let sessionId: string | undefined;
  if (input.mode !== "files") { const source = id(input.sessionId ?? "", "sessionId"); const fork = await input.sdk!.forkSession(source, { upToMessageId: messageId }); sessionId = id(fork.sessionId, "forked sessionId"); input.setSessionId?.(sessionId); }
  return { mode: input.mode, messageId, ...(files === undefined ? {} : { files }), ...(sessionId === undefined ? {} : { sessionId }) };
}
