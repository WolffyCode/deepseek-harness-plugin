import type { JsonRpcLineTransport } from "../codex/json-rpc.js";
import type {
  AgentMetadata,
  AgentMode,
  AgentModel,
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentProvider,
  AgentRuntimeInfo,
  AgentStreamEvent,
  AgentTimelineItem,
  AgentUsage,
  ProviderSubagentEvent,
} from "./provider-contract.js";

/** Opaque transport payload; the public stream vocabulary is AgentStreamEvent only. */
export type ExternalEngineEvent = unknown;
export type ExternalEngineEventHandler = (event: ExternalEngineEvent) => void;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function fieldString(value: UnknownRecord, key: string): string | undefined {
  return stringValue(value[key]);
}

function fieldBoolean(value: UnknownRecord, key: string): boolean | undefined {
  return typeof value[key] === "boolean" ? value[key] : undefined;
}

function turnIdFrom(value: UnknownRecord): string | undefined {
  return fieldString(value, "turnId") ?? fieldString(value, "turn_id");
}

function withTurn(event: AgentStreamEvent, turnId: string | undefined): AgentStreamEvent {
  return turnId === undefined ? event : { ...event, turnId } as AgentStreamEvent;
}

function usageFrom(value: unknown): AgentUsage | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const usage: {
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    totalCostUsd?: number;
    contextWindowMaxTokens?: number;
    contextWindowUsedTokens?: number;
  } = {};
  const numeric = (key: string): number | undefined => typeof input[key] === "number" ? input[key] as number : undefined;
  const values: ReadonlyArray<readonly [keyof typeof usage, number | undefined]> = [
    ["inputTokens", numeric("inputTokens") ?? numeric("input_tokens")],
    ["cachedInputTokens", numeric("cachedInputTokens") ?? numeric("cached_input_tokens")],
    ["outputTokens", numeric("outputTokens") ?? numeric("output_tokens")],
    ["totalCostUsd", numeric("totalCostUsd") ?? numeric("total_cost_usd")],
    ["contextWindowMaxTokens", numeric("contextWindowMaxTokens") ?? numeric("context_window_max_tokens")],
    ["contextWindowUsedTokens", numeric("contextWindowUsedTokens") ?? numeric("context_window_used_tokens")],
  ];
  for (const [key, valueForKey] of values) if (valueForKey !== undefined) usage[key] = valueForKey;
  return usage;
}

function modeFrom(value: unknown): AgentMode | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const id = fieldString(input, "id");
  const label = fieldString(input, "label");
  if (id === undefined || label === undefined) return undefined;
  const description = fieldString(input, "description");
  return description === undefined ? { id, label } : { id, label, description };
}

function modelFrom(value: unknown): AgentModel | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const id = fieldString(input, "id");
  if (id === undefined) return undefined;
  const label = fieldString(input, "label");
  const aliasesValue = input["aliases"];
  const aliases = Array.isArray(aliasesValue) ? aliasesValue.filter((item): item is string => typeof item === "string") : undefined;
  return { id, ...(label === undefined ? {} : { label }), ...(aliases === undefined ? {} : { aliases }) };
}

function runtimeInfoFrom(value: unknown, provider: AgentProvider): AgentRuntimeInfo | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const sessionValue = input["sessionId"];
  const sessionId = sessionValue === null ? null : stringValue(sessionValue);
  if (sessionValue !== null && sessionId === undefined) return undefined;
  const model = input["model"] === null ? null : stringValue(input["model"]);
  const modeId = input["modeId"] === null ? null : stringValue(input["modeId"]);
  const thinkingOptionId = input["thinkingOptionId"] === null ? null : stringValue(input["thinkingOptionId"]);
  return {
    provider,
    sessionId: sessionId ?? null,
    ...(model === undefined ? {} : { model }),
    ...(modeId === undefined ? {} : { modeId }),
    ...(thinkingOptionId === undefined ? {} : { thinkingOptionId }),
  };
}

function timelineItemFrom(value: unknown): AgentTimelineItem | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const type = fieldString(input, "type");
  if (type === "user_message") {
    const text = fieldString(input, "text");
    if (text === undefined) return undefined;
    const messageId = fieldString(input, "messageId");
    const clientMessageId = fieldString(input, "clientMessageId");
    return { type, text, ...(messageId === undefined ? {} : { messageId }), ...(clientMessageId === undefined ? {} : { clientMessageId }) };
  }
  if (type === "assistant_message") {
    const text = fieldString(input, "text");
    if (text === undefined) return undefined;
    const messageId = fieldString(input, "messageId");
    const partial = fieldBoolean(input, "partial");
    return { type, text, ...(messageId === undefined ? {} : { messageId }), ...(partial === undefined ? {} : { partial }) };
  }
  if (type === "reasoning") {
    const text = fieldString(input, "text");
    return text === undefined ? undefined : { type, text };
  }
  if (type === "error") {
    const message = fieldString(input, "message");
    return message === undefined ? undefined : { type, message };
  }
  if (type !== "tool_call") return undefined;
  const id = fieldString(input, "id");
  const name = fieldString(input, "name");
  const status = fieldString(input, "status");
  if (id === undefined || name === undefined || (status !== "running" && status !== "completed" && status !== "failed" && status !== "canceled")) return undefined;
  const error = fieldString(input, "error");
  return {
    type,
    id,
    name,
    status,
    ...(Object.prototype.hasOwnProperty.call(input, "input") ? { input: input["input"] } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "output") ? { output: input["output"] } : {}),
    ...(error === undefined ? {} : { error }),
  };
}

function permissionRequestFrom(value: unknown): AgentPermissionRequest | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const id = fieldString(input, "id");
  const name = fieldString(input, "name");
  const kind = fieldString(input, "kind");
  if (id === undefined || name === undefined || (kind !== "tool" && kind !== "plan" && kind !== "question" && kind !== "mode" && kind !== "other")) return undefined;
  const title = fieldString(input, "title");
  const description = fieldString(input, "description");
  const nestedInput = record(input["input"]);
  return {
    id,
    name,
    kind,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(nestedInput === undefined ? {} : { input: nestedInput as AgentMetadata }),
  };
}

function permissionResponseFrom(value: unknown): AgentPermissionResponse | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const behavior = fieldString(input, "behavior");
  const selectedActionId = fieldString(input, "selectedActionId");
  if (behavior === "allow") {
    const updatedInput = record(input["updatedInput"]);
    return { behavior, ...(selectedActionId === undefined ? {} : { selectedActionId }), ...(updatedInput === undefined ? {} : { updatedInput: updatedInput as AgentMetadata }) };
  }
  if (behavior === "deny") {
    const message = fieldString(input, "message");
    const interrupt = fieldBoolean(input, "interrupt");
    return { behavior, ...(selectedActionId === undefined ? {} : { selectedActionId }), ...(message === undefined ? {} : { message }), ...(interrupt === undefined ? {} : { interrupt }) };
  }
  return undefined;
}

function providerSubagentFrom(value: unknown): ProviderSubagentEvent | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const subagentId = fieldString(input, "subagentId");
  const status = fieldString(input, "status");
  if (subagentId === undefined || (status !== "started" && status !== "updated" && status !== "completed" && status !== "failed" && status !== "canceled")) return undefined;
  const text = fieldString(input, "text");
  const item = timelineItemFrom(input["item"]);
  return { subagentId, status, ...(text === undefined ? {} : { text }), ...(item === undefined ? {} : { item }) };
}

/** Converts opaque CLI notifications and canonical events to AgentStreamEvent. */
export function normalizeExternalEngineEvent(value: unknown, provider: AgentProvider, fallbackTurnId?: string): AgentStreamEvent | undefined {
  const input = record(value);
  if (input === undefined) return undefined;
  const type = fieldString(input, "type");
  if (type === undefined) return undefined;
  const turnId = turnIdFrom(input) ?? fallbackTurnId;

  if (type === "text-delta") {
    const text = fieldString(input, "text");
    if (text === undefined) return undefined;
    const event: AgentStreamEvent = { type: "timeline", provider, item: { type: "assistant_message", text, partial: true } };
    return withTurn(event, turnId);
  }
  if (type === "tool-call") {
    const id = fieldString(input, "id");
    const name = fieldString(input, "name");
    if (id === undefined || name === undefined) return undefined;
    const event: AgentStreamEvent = { type: "timeline", provider, item: { type: "tool_call", id, name, status: "running", ...(input["arguments"] === undefined ? {} : { input: input["arguments"] }) } };
    return withTurn(event, turnId);
  }
  if (type === "tool-result") {
    const id = fieldString(input, "id");
    if (id === undefined) return undefined;
    const output = input["output"];
    const failed = fieldBoolean(input, "isError") ?? false;
    const event: AgentStreamEvent = {
      type: "timeline",
      provider,
      item: {
        type: "tool_call",
        id,
        name: fieldString(input, "name") ?? "external_tool",
        status: failed ? "failed" : "completed",
        ...(output === undefined ? {} : { output }),
        ...(failed ? { error: typeof output === "string" ? output : "external tool failed" } : {}),
      },
    };
    return withTurn(event, turnId);
  }
  if (type === "turn-completed") {
    const status = fieldString(input, "status");
    const event: AgentStreamEvent = status === "completed"
      ? { type: "turn_completed", provider }
      : { type: "turn_failed", provider, error: fieldString(input, "error") ?? "external engine turn failed" };
    return withTurn(event, turnId);
  }

  if (type === "thread_started") {
    const sessionId = fieldString(input, "sessionId");
    return sessionId === undefined ? undefined : { type: "thread_started", provider, sessionId };
  }
  if (type === "turn_started") return withTurn({ type: "turn_started", provider }, turnId);
  if (type === "turn_completed") {
    const usage = usageFrom(input["usage"]);
    const event: AgentStreamEvent = { type: "turn_completed", provider, ...(usage === undefined ? {} : { usage }) };
    return withTurn(event, turnId);
  }
  if (type === "turn_failed") {
    const error = fieldString(input, "error");
    if (error === undefined) return undefined;
    const code = fieldString(input, "code");
    const diagnostic = fieldString(input, "diagnostic");
    const event: AgentStreamEvent = { type: "turn_failed", provider, error, ...(code === undefined ? {} : { code }), ...(diagnostic === undefined ? {} : { diagnostic }) };
    return withTurn(event, turnId);
  }
  if (type === "turn_canceled") {
    const reason = fieldString(input, "reason");
    if (reason === undefined) return undefined;
    const event: AgentStreamEvent = { type: "turn_canceled", provider, reason };
    return withTurn(event, turnId);
  }
  if (type === "timeline") {
    const item = timelineItemFrom(input["item"]);
    if (item === undefined) return undefined;
    const timestamp = fieldString(input, "timestamp");
    const event: AgentStreamEvent = { type: "timeline", provider, item, ...(timestamp === undefined ? {} : { timestamp }) };
    return withTurn(event, turnId);
  }
  if (type === "reasoning") {
    const text = fieldString(input, "text");
    if (text === undefined) return undefined;
    const event: AgentStreamEvent = { type: "reasoning", provider, text };
    return withTurn(event, turnId);
  }
  if (type === "usage_updated") {
    const usage = usageFrom(input["usage"]);
    if (usage === undefined) return undefined;
    const event: AgentStreamEvent = { type: "usage_updated", provider, usage };
    return withTurn(event, turnId);
  }
  if (type === "permission_requested") {
    const request = permissionRequestFrom(input["request"]);
    if (request === undefined) return undefined;
    const event: AgentStreamEvent = { type: "permission_requested", provider, request };
    return withTurn(event, turnId);
  }
  if (type === "permission_resolved") {
    const requestId = fieldString(input, "requestId");
    const resolution = permissionResponseFrom(input["resolution"]);
    if (requestId === undefined || resolution === undefined) return undefined;
    const event: AgentStreamEvent = { type: "permission_resolved", provider, requestId, resolution };
    return withTurn(event, turnId);
  }
  if (type === "mode_changed") {
    const currentModeId = input["currentModeId"] === null ? null : fieldString(input, "currentModeId") ?? null;
    const availableModes = Array.isArray(input["availableModes"])
      ? input["availableModes"].map(modeFrom).filter((mode): mode is AgentMode => mode !== undefined)
      : [];
    return { type: "mode_changed", provider, currentModeId, availableModes };
  }
  if (type === "model_changed") {
    const runtimeInfo = runtimeInfoFrom(input["runtimeInfo"], provider);
    return runtimeInfo === undefined ? undefined : { type: "model_changed", provider, runtimeInfo };
  }
  if (type === "thinking_option_changed") {
    const thinkingOptionId = input["thinkingOptionId"] === null ? null : fieldString(input, "thinkingOptionId") ?? null;
    return { type: "thinking_option_changed", provider, thinkingOptionId };
  }
  if (type === "attention_required") {
    const reason = fieldString(input, "reason");
    const timestamp = fieldString(input, "timestamp");
    if ((reason !== "finished" && reason !== "error" && reason !== "permission") || timestamp === undefined) return undefined;
    return { type: "attention_required", provider, reason, timestamp };
  }
  if (type === "provider_subagent") {
    const event = providerSubagentFrom(input["event"]);
    if (event === undefined) return undefined;
    const canonical: AgentStreamEvent = { type: "provider_subagent", provider, event };
    return withTurn(canonical, turnId);
  }
  if (type === "error") {
    const error = fieldString(input, "error");
    if (error === undefined) return undefined;
    const code = fieldString(input, "code");
    const event: AgentStreamEvent = { type: "error", provider, error, ...(code === undefined ? {} : { code }) };
    return withTurn(event, turnId);
  }
  return undefined;
}

/** Runtime boundary used by the Harness bridge. */
export interface ExternalEngineRuntime {
  readonly transport?: Pick<JsonRpcLineTransport, "onNotification">;
  readonly process: { readonly exited: Promise<unknown>; readonly stderrTail: string };
  readonly turnId: string | undefined;
  onEvent(handler: ExternalEngineEventHandler): () => void;
  startTurn(text: string, signal?: AbortSignal): Promise<{ readonly id: string }>;
  interrupt(signal?: AbortSignal): Promise<unknown>;
  close(): Promise<unknown>;
}
