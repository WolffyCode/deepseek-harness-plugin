export type TaskStatus = "pending" | "running" | "completed" | "failed" | "killed" | "paused";
export type SubagentStatus = "running" | "completed" | "failed" | "canceled";
export type SubagentEvent = {
    kind: "started";
    taskId: string;
    toolUseId?: string;
    description?: string;
    subagentType?: string;
    taskType?: string;
} | {
    kind: "progress";
    taskId: string;
    description?: string;
    summary?: string;
} | {
    kind: "notification";
    taskId: string;
    status: "completed" | "failed" | "stopped";
    summary?: string;
} | {
    kind: "updated";
    taskId: string;
    status?: TaskStatus;
    error?: string;
} | {
    kind: "result";
    taskId: string;
    result: unknown;
} | {
    kind: "failure";
    taskId: string;
    error: string;
} | {
    kind: "cancel";
    taskId: string;
};
export type SubagentObservation = {
    id: string;
    kind: "declared" | "progress" | "result" | "failure" | "cancel";
    status?: SubagentStatus;
    description?: string;
    summary?: string;
    error?: string;
    result?: unknown;
};
export declare function normalizeSubagentMessage(input: unknown): SubagentEvent | undefined;
export declare function createSubagentReducer(): {
    reduce: (input: unknown) => SubagentObservation[];
    snapshot: () => {
        id: string;
        status: SubagentStatus;
        declared: boolean;
        aliases: string[];
    }[];
};
export declare function observeSubagentMessages(messages: Iterable<unknown>): SubagentObservation[];
//# sourceMappingURL=subagents.d.ts.map