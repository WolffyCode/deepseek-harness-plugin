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
  /** Optional provider readiness gate; Claude exposes it to await SDK initialization. */
  whenReady?(): Promise<void>;
  startTurn(text: string, signal?: AbortSignal): Promise<{ readonly id: string }>;
  interrupt(signal?: AbortSignal): Promise<unknown>;
  close(): Promise<unknown>;
}

import type { ClaudeAdapterEvent, ClaudeAgentSession, ClaudeAdapterOptions, ClaudeThinkingOption, ClaudeTimelineItem, ClaudeUsage, ClaudePermissionRequest } from "../claude/types.js";

/** Adapts the native Claude session to the Harness external-engine runtime contract. */
function toUsage(value: ClaudeUsage): AgentUsage {
  const usage: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; totalCostUsd?: number; contextWindowMaxTokens?: number; contextWindowUsedTokens?: number } = {};
  if (typeof value.inputTokens === "number") usage.inputTokens = value.inputTokens;
  if (typeof value.cachedInputTokens === "number") usage.cachedInputTokens = value.cachedInputTokens;
  if (typeof value.outputTokens === "number") usage.outputTokens = value.outputTokens;
  if (typeof value.totalCostUsd === "number") usage.totalCostUsd = value.totalCostUsd;
  if (typeof value.contextWindowMaxTokens === "number") usage.contextWindowMaxTokens = value.contextWindowMaxTokens;
  if (typeof value.contextWindowUsedTokens === "number") usage.contextWindowUsedTokens = value.contextWindowUsedTokens;
  return usage;
}

function toPermission(request: ClaudePermissionRequest): AgentPermissionRequest {
  return {
    id: request.requestId,
    kind: "tool",
    name: request.toolName,
    input: request.input,
    ...(request.title === undefined ? {} : { title: request.title }),
    ...(request.description === undefined ? {} : { description: request.description }),
  };
}

export class ClaudeSessionRuntimeBridge implements ExternalEngineRuntime {
  readonly process = { exited: Promise.resolve(undefined), stderrTail: "" };
  private readonly listeners = new Set<ExternalEngineEventHandler>();
  private readonly unsubscribe: () => void;
  private activeTurnId: string | undefined;
  private interruptTurnId: string | undefined;
  private interruptPromise: Promise<void> | undefined;
  private closed = false;

  constructor(readonly session: ClaudeAgentSession) {
    this.unsubscribe = session.subscribe(event => {
      if (event.type === "turn_started") {
        this.activeTurnId = event.turnId;
        this.interruptTurnId = undefined;
        this.interruptPromise = undefined;
      }
      const projected = this.project(event);
      if (projected !== undefined) for (const listener of [...this.listeners]) listener(projected);
      if (event.type === "turn_completed" || event.type === "turn_failed" || event.type === "turn_canceled") {
        if (event.turnId === undefined || event.turnId === this.activeTurnId) {
          this.activeTurnId = undefined;
        }
      }
    });
  }

  get turnId(): string | undefined { return this.activeTurnId; }

  whenReady(): Promise<void> { return this.session.whenReady?.() ?? Promise.resolve(); }

  onEvent(handler: ExternalEngineEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async startTurn(text: string, _signal?: AbortSignal): Promise<{ readonly id: string }> {
    const result = await this.session.startTurn(text);
    this.activeTurnId = result.turnId;
    this.interruptTurnId = undefined;
    this.interruptPromise = undefined;
    return { id: result.turnId };
  }

  async interrupt(_signal?: AbortSignal): Promise<void> {
    if (this.closed || this.activeTurnId === undefined) return;
    if (this.interruptTurnId === this.activeTurnId && this.interruptPromise !== undefined) {
      await this.interruptPromise;
      return;
    }
    const turnId = this.activeTurnId;
    this.interruptTurnId = turnId;
    this.interruptPromise = this.session.interrupt();
    await this.interruptPromise;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    await this.session.close();
  }

  private project(event: ClaudeAdapterEvent): AgentStreamEvent | undefined {
    const provider = "claude-cli" as AgentProvider;
    switch (event.type) {
      case "session_started": return { type: "thread_started", provider, sessionId: event.sessionId };
      case "turn_started": return { type: "turn_started", provider, turnId: event.turnId };
      case "timeline": return { type: "timeline", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), item: this.timeline(event.item) };
      case "usage_updated": return { type: "usage_updated", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), usage: toUsage(event.usage) };
      case "permission_requested": return { type: "permission_requested", provider, request: toPermission(event.request) };
      case "status_changed": return { type: "error", provider, error: event.status };
      case "turn_completed": return { type: "turn_completed", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), ...(event.usage === undefined ? {} : { usage: toUsage(event.usage) }) };
      case "turn_failed": return { type: "turn_failed", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), error: event.error };
      case "turn_canceled": return { type: "turn_canceled", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), reason: "canceled" };
      default: return undefined;
    }
  }

  private timeline(item: ClaudeTimelineItem): AgentTimelineItem {
    const value = item as { type: string; id?: string; text?: string; name?: string; arguments?: string; output?: string; isError?: boolean; partial?: boolean; metadata?: Record<string, unknown> };
    if (value.type === "tool_call" || value.type === "tool_result") {
      let input: unknown = value.arguments;
      if (typeof value.arguments === "string") { try { input = JSON.parse(value.arguments); } catch { input = value.arguments; } }
      return { type: "tool_call", id: value.id ?? "", name: value.name ?? "external_tool", status: value.type === "tool_result" ? (value.isError ? "failed" : "completed") : "running", ...(input === undefined ? {} : { input }), ...(value.output === undefined ? {} : { output: value.output }) };
    }
    if (value.type === "reasoning") return { type: "reasoning", text: value.text ?? "" };
    if (value.type === "compaction") return { type: "compaction", status: "completed" };
    if (value.type === "status") return { type: "error", message: value.text ?? "" };
    return { type: "assistant_message", text: value.text ?? "", ...(value.partial === undefined ? {} : { partial: value.partial }) };
  }
}
