export type TaskStatus = "pending" | "running" | "completed" | "failed" | "killed" | "paused";
export type SubagentStatus = "running" | "completed" | "failed" | "canceled";
export type SubagentEvent =
  | { kind: "started"; taskId: string; toolUseId?: string; description?: string; subagentType?: string; taskType?: string }
  | { kind: "progress"; taskId: string; description?: string; summary?: string }
  | { kind: "notification"; taskId: string; status: "completed" | "failed" | "stopped"; summary?: string }
  | { kind: "updated"; taskId: string; status?: TaskStatus; error?: string }
  | { kind: "result"; taskId: string; result: unknown }
  | { kind: "failure"; taskId: string; error: string }
  | { kind: "cancel"; taskId: string };
export type SubagentObservation = { id: string; kind: "declared" | "progress" | "result" | "failure" | "cancel"; status?: SubagentStatus; description?: string; summary?: string; error?: string; result?: unknown };
type RecordValue = Record<string, unknown>;
type State = { id: string; aliases: Set<string>; declared: boolean; status: SubagentStatus };
function asRecord(value: unknown): RecordValue | undefined { return value !== null && typeof value === "object" ? value as RecordValue : undefined; }
function asText(value: unknown): string | undefined { return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined; }
function optional(record: RecordValue, key: string): string | undefined { return asText(record[key]); }
export function normalizeSubagentMessage(input: unknown): SubagentEvent | undefined {
  const record = asRecord(input); if (!record) return undefined;
  const subtype = asText(record["subtype"]); const taskId = asText(record["task_id"]); if (!subtype || !taskId) return undefined;
  if (subtype === "task_started") {
    const result: SubagentEvent = { kind: "started", taskId }; const toolUseId = optional(record, "tool_use_id"); const description = optional(record, "description"); const subagentType = optional(record, "subagent_type"); const taskType = optional(record, "task_type");
    if (toolUseId) result.toolUseId = toolUseId; if (description) result.description = description; if (subagentType) result.subagentType = subagentType; if (taskType) result.taskType = taskType; return result;
  }
  if (subtype === "task_progress") { const result: SubagentEvent = { kind: "progress", taskId }; const description = optional(record, "description"); const summary = optional(record, "summary"); if (description) result.description = description; if (summary) result.summary = summary; return result; }
  if (subtype === "task_notification" && (record["status"] === "completed" || record["status"] === "failed" || record["status"] === "stopped")) { const result: SubagentEvent = { kind: "notification", taskId, status: record["status"] }; const summary = optional(record, "summary"); if (summary) result.summary = summary; return result; }
  if (subtype === "task_updated") { const patch = asRecord(record["patch"]); if (!patch) return undefined; const result: SubagentEvent = { kind: "updated", taskId }; const status = patch["status"]; const error = asText(patch["error"]); if (status === "pending" || status === "running" || status === "completed" || status === "failed" || status === "killed" || status === "paused") result.status = status; if (error) result.error = error; return result; }
  if (subtype === "task_result") return { kind: "result", taskId, result: record["result"] };
  if (subtype === "task_failure") { const error = optional(record, "error"); return error ? { kind: "failure", taskId, error } : undefined; }
  if (subtype === "task_cancel") return { kind: "cancel", taskId };
  return undefined;
}
function isSubagent(event: Extract<SubagentEvent, { kind: "started" }>): boolean { return event.taskType === "local_agent" || event.taskType === "local_workflow" || (event.taskType === undefined && event.subagentType !== undefined); }
function terminal(status: SubagentStatus): boolean { return status !== "running"; }
function mapped(status: TaskStatus): SubagentStatus | undefined { return status === "completed" ? "completed" : status === "failed" ? "failed" : status === "killed" ? "canceled" : status === "running" ? "running" : undefined; }
export function createSubagentReducer() {
  const states = new Map<string, State>(); const aliases = new Map<string, string>(); const pending = new Map<string, SubagentEvent[]>();
  const reduceKnown = (event: SubagentEvent, id: string, state: State): SubagentObservation[] => {
    if (event.kind === "progress") { const result: SubagentObservation = { id, kind: "progress" }; if (event.description) result.description = event.description; if (event.summary) result.summary = event.summary; return [result]; }
    if (event.kind === "result" || event.kind === "failure" || event.kind === "cancel" || event.kind === "notification" || event.kind === "updated") {
      let status: SubagentStatus | undefined; let kind: SubagentObservation["kind"];
      if (event.kind === "result" || (event.kind === "notification" && event.status === "completed") || (event.kind === "updated" && event.status === "completed")) { status = "completed"; kind = "result"; }
      else if (event.kind === "failure" || (event.kind === "notification" && event.status === "failed") || (event.kind === "updated" && event.status === "failed")) { status = "failed"; kind = "failure"; }
      else if (event.kind === "cancel" || (event.kind === "notification" && event.status === "stopped") || (event.kind === "updated" && event.status === "killed")) { status = "canceled"; kind = "cancel"; }
      else { status = event.kind === "updated" ? mapped(event.status ?? "pending") : undefined; if (!status || status === state.status || (terminal(state.status) && status === "running")) return []; state.status = status; return [{ id, kind: "progress", status }]; }
      if (terminal(state.status)) return []; state.status = status; const result: SubagentObservation = { id, kind, status }; if (event.kind === "failure") result.error = event.error; if (event.kind === "updated" && event.error) result.error = event.error; if (event.kind === "notification" && event.summary) result.summary = event.summary; if (event.kind === "result") result.result = event.result; return [result];
    }
    return [];
  };
  const reduce = (input: unknown): SubagentObservation[] => {
    const event = normalizeSubagentMessage(input); if (!event) return [];
    if (event.kind === "started") { if (!isSubagent(event)) { pending.delete(event.taskId); return []; } const id = aliases.get(event.toolUseId ?? event.taskId) ?? event.toolUseId ?? event.taskId; const state = states.get(id) ?? { id, aliases: new Set<string>(), declared: false, status: "running" }; aliases.set(event.taskId, id); if (event.toolUseId) aliases.set(event.toolUseId, id); state.aliases.add(event.taskId); if (event.toolUseId) state.aliases.add(event.toolUseId); states.set(id, state); const observations: SubagentObservation[] = []; if (!state.declared) { state.declared = true; const declared: SubagentObservation = { id, kind: "declared", status: "running" }; if (event.description) declared.description = event.description; observations.push(declared); } for (const queued of pending.get(event.taskId) ?? []) observations.push(...reduceKnown(queued, id, state)); pending.delete(event.taskId); return observations; }
    const id = aliases.get(event.taskId); const state = id === undefined ? undefined : states.get(id); if (id === undefined || !state) { const queued = pending.get(event.taskId) ?? []; queued.push(event); pending.set(event.taskId, queued); return []; }
    return reduceKnown(event, id, state);
  };
  return { reduce, snapshot: () => [...states.values()].map((state) => ({ id: state.id, status: state.status, declared: state.declared, aliases: [...state.aliases] })) };
}
export function observeSubagentMessages(messages: Iterable<unknown>): SubagentObservation[] { const reducer = createSubagentReducer(); const result: SubagentObservation[] = []; for (const message of messages) result.push(...reducer.reduce(message)); return result; }
