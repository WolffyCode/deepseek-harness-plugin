import { type Query } from "@anthropic-ai/claude-agent-sdk";
export interface ClaudeRewindSdk {
    forkSession(sessionId: string, options: {
        upToMessageId: string;
    }): Promise<{
        sessionId: string;
    }>;
}
export declare const realClaudeRewindSdk: ClaudeRewindSdk;
export type RewindMode = "conversation" | "files" | "both";
export interface RewindInput {
    mode: RewindMode;
    sessionId?: string | null;
    messageId: string;
    dryRun?: boolean;
    sdk?: ClaudeRewindSdk;
    query?: Pick<Query, "rewindFiles">;
    resolveMessageId?: (id: string) => string | Promise<string>;
    setSessionId?: (id: string) => void;
}
export interface RewindResult {
    mode: RewindMode;
    messageId: string;
    files?: Awaited<ReturnType<Query["rewindFiles"]>>;
    sessionId?: string;
}
export declare function rewindClaude(input: RewindInput): Promise<RewindResult>;
//# sourceMappingURL=rewind.d.ts.map