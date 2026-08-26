function asRecord(value) { return value !== null && typeof value === "object" ? value : undefined; }
function asText(value) { return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined; }
function optional(record, key) { return asText(record[key]); }
export function normalizeSubagentMessage(input) {
    const record = asRecord(input);
    if (!record)
        return undefined;
    const subtype = asText(record["subtype"]);
    const taskId = asText(record["task_id"]);
    if (!subtype || !taskId)
        return undefined;
    if (subtype === "task_started") {
        const result = { kind: "started", taskId };
        const toolUseId = optional(record, "tool_use_id");
        const description = optional(record, "description");
        const subagentType = optional(record, "subagent_type");
        const taskType = optional(record, "task_type");
        if (toolUseId)
            result.toolUseId = toolUseId;
        if (description)
            result.description = description;
        if (subagentType)
            result.subagentType = subagentType;
        if (taskType)
            result.taskType = taskType;
        return result;
    }
    if (subtype === "task_progress") {
        const result = { kind: "progress", taskId };
        const description = optional(record, "description");
        const summary = optional(record, "summary");
        if (description)
            result.description = description;
        if (summary)
            result.summary = summary;
        return result;
    }
    if (subtype === "task_notification" && (record["status"] === "completed" || record["status"] === "failed" || record["status"] === "stopped")) {
        const result = { kind: "notification", taskId, status: record["status"] };
        const summary = optional(record, "summary");
        if (summary)
            result.summary = summary;
        return result;
    }
    if (subtype === "task_updated") {
        const patch = asRecord(record["patch"]);
        if (!patch)
            return undefined;
        const result = { kind: "updated", taskId };
        const status = patch["status"];
        const error = asText(patch["error"]);
        if (status === "pending" || status === "running" || status === "completed" || status === "failed" || status === "killed" || status === "paused")
            result.status = status;
        if (error)
            result.error = error;
        return result;
    }
    if (subtype === "task_result")
        return { kind: "result", taskId, result: record["result"] };
    if (subtype === "task_failure") {
        const error = optional(record, "error");
        return error ? { kind: "failure", taskId, error } : undefined;
    }
    if (subtype === "task_cancel")
        return { kind: "cancel", taskId };
    return undefined;
}
function isSubagent(event) { return event.taskType === "local_agent" || event.taskType === "local_workflow" || (event.taskType === undefined && event.subagentType !== undefined); }
function terminal(status) { return status !== "running"; }
function mapped(status) { return status === "completed" ? "completed" : status === "failed" ? "failed" : status === "killed" ? "canceled" : status === "running" ? "running" : undefined; }
export function createSubagentReducer() {
    const states = new Map();
    const aliases = new Map();
    const pending = new Map();
    const reduceKnown = (event, id, state) => {
        if (event.kind === "progress") {
            const result = { id, kind: "progress" };
            if (event.description)
                result.description = event.description;
            if (event.summary)
                result.summary = event.summary;
            return [result];
        }
        if (event.kind === "result" || event.kind === "failure" || event.kind === "cancel" || event.kind === "notification" || event.kind === "updated") {
            let status;
            let kind;
            if (event.kind === "result" || (event.kind === "notification" && event.status === "completed") || (event.kind === "updated" && event.status === "completed")) {
                status = "completed";
                kind = "result";
            }
            else if (event.kind === "failure" || (event.kind === "notification" && event.status === "failed") || (event.kind === "updated" && event.status === "failed")) {
                status = "failed";
                kind = "failure";
            }
            else if (event.kind === "cancel" || (event.kind === "notification" && event.status === "stopped") || (event.kind === "updated" && event.status === "killed")) {
                status = "canceled";
                kind = "cancel";
            }
            else {
                status = event.kind === "updated" ? mapped(event.status ?? "pending") : undefined;
                if (!status || status === state.status || (terminal(state.status) && status === "running"))
                    return [];
                state.status = status;
                return [{ id, kind: "progress", status }];
            }
            if (terminal(state.status))
                return [];
            state.status = status;
            const result = { id, kind, status };
            if (event.kind === "failure")
                result.error = event.error;
            if (event.kind === "updated" && event.error)
                result.error = event.error;
            if (event.kind === "notification" && event.summary)
                result.summary = event.summary;
            if (event.kind === "result")
                result.result = event.result;
            return [result];
        }
        return [];
    };
    const reduce = (input) => {
        const event = normalizeSubagentMessage(input);
        if (!event)
            return [];
        if (event.kind === "started") {
            if (!isSubagent(event)) {
                pending.delete(event.taskId);
                return [];
            }
            const id = aliases.get(event.toolUseId ?? event.taskId) ?? event.toolUseId ?? event.taskId;
            const state = states.get(id) ?? { id, aliases: new Set(), declared: false, status: "running" };
            aliases.set(event.taskId, id);
            if (event.toolUseId)
                aliases.set(event.toolUseId, id);
            state.aliases.add(event.taskId);
            if (event.toolUseId)
                state.aliases.add(event.toolUseId);
            states.set(id, state);
            const observations = [];
            if (!state.declared) {
                state.declared = true;
                const declared = { id, kind: "declared", status: "running" };
                if (event.description)
                    declared.description = event.description;
                observations.push(declared);
            }
            for (const queued of pending.get(event.taskId) ?? [])
                observations.push(...reduceKnown(queued, id, state));
            pending.delete(event.taskId);
            return observations;
        }
        const id = aliases.get(event.taskId);
        const state = id === undefined ? undefined : states.get(id);
        if (id === undefined || !state) {
            const queued = pending.get(event.taskId) ?? [];
            queued.push(event);
            pending.set(event.taskId, queued);
            return [];
        }
        return reduceKnown(event, id, state);
    };
    return { reduce, snapshot: () => [...states.values()].map((state) => ({ id: state.id, status: state.status, declared: state.declared, aliases: [...state.aliases] })) };
}
export function observeSubagentMessages(messages) { const reducer = createSubagentReducer(); const result = []; for (const message of messages)
    result.push(...reducer.reduce(message)); return result; }
//# sourceMappingURL=subagents.js.map