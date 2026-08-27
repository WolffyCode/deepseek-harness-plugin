import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AgentCommand,
  type AgentPersistenceHandle,
  type AgentPermissionResponse,
  type AgentPromptInput,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentSession,
  type AgentStreamEvent,
  type ProviderCapabilities,
} from "../src/agent/provider-contract.js";
import { normalizeExternalEngineEvent } from "../src/agent/runtime.js";
import {
  AgentSessionStateError,
  AgentTurnCoordinator,
  ConcurrentTurnError,
  runProviderTurn,
} from "../src/agent/stream-events.js";

const capabilities: ProviderCapabilities = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsDynamicModes: true,
  supportsMcpServers: false,
  supportsReasoningStream: true,
  supportsToolInvocations: true,
};

const persistence: AgentPersistenceHandle = { provider: "fake", sessionId: "session-1" };

class FakeStream {
  private readonly listeners = new Set<(event: AgentStreamEvent) => void>();
  readonly history: AgentStreamEvent[] = [];

  subscribe(listener: (event: AgentStreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AgentStreamEvent): void {
    this.history.push(event);
    for (const listener of [...this.listeners]) listener(event);
  }

  listenerCount(): number { return this.listeners.size; }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> { yield* this.history; }
}

class FakeSession implements AgentSession {
  readonly provider = "fake";
  readonly persistence = persistence;
  readonly capabilities = capabilities;
  readonly stream = new FakeStream();
  readonly commands: readonly AgentCommand[] = [{ name: "/help", description: "Show help" }];
  readonly permissions = {
    pending: [],
    respond: async (_requestId: string, _response: AgentPermissionResponse) => {},
  };
  readonly coordinator = new AgentTurnCoordinator();
  private sessionState: "new" | "ready" | "closing" | "closed" | "failed" = "ready";
  nextTurnId = "turn-1";
  prompt: AgentPromptInput | undefined;
  options: AgentRunOptions | undefined;
  interrupted = false;
  closed = false;

  get state() { return this.sessionState; }
  get turnState() { return this.coordinator.state; }
  get activeTurnId() { return this.coordinator.activeTurnId; }

  run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    return runProviderTurn({
      prompt,
      startTurn: this.startTurn.bind(this),
      subscribe: this.subscribe.bind(this),
      getSessionId: () => this.persistence.sessionId,
      coordinator: this.coordinator,
      provider: this.provider,
      getState: () => ({ session: this.state, turn: this.turnState, activeTurnId: this.activeTurnId }),
      interrupt: this.interrupt.bind(this),
      ...(options === undefined ? {} : { runOptions: options }),
    });
  }

  async startTurn(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<{ readonly turnId: string }> {
    this.prompt = prompt;
    this.options = options;
    return { turnId: this.nextTurnId };
  }

  subscribe(listener: (event: AgentStreamEvent) => void): () => void { return this.stream.subscribe(listener); }
  streamHistory(): AsyncGenerator<AgentStreamEvent> { return this.stream.streamHistory(); }
  async interrupt(): Promise<void> { this.interrupted = true; }
  async close(): Promise<void> { this.closed = true; this.sessionState = "closed"; }
  async setMode(_modeId: string | null): Promise<void> {}
  async setModel(_modelId: string | null): Promise<void> {}
  async setThinkingOption(_thinkingOptionId: string | null): Promise<void> {}
}

function complete(session: FakeSession, turnId = "turn-1"): void {
  session.stream.emit({ type: "turn_completed", provider: "fake", turnId });
}

test("normal turn collects timeline, reasoning, usage, and final text", async () => {
  const session = new FakeSession();
  const run = session.run("hello");
  session.stream.emit({ type: "timeline", provider: "fake", turnId: "turn-1", item: { type: "assistant_message", text: "done" } });
  session.stream.emit({ type: "reasoning", provider: "fake", turnId: "turn-1", text: "thinking" });
  session.stream.emit({ type: "usage_updated", provider: "fake", turnId: "turn-1", usage: { outputTokens: 3 } });
  session.stream.emit({ type: "turn_completed", provider: "fake", turnId: "turn-1", usage: { outputTokens: 4 } });
  const result = await run;
  assert.equal(result.finalText, "done");
  assert.deepEqual(result.usage, { outputTokens: 4 });
  assert.deepEqual(result.timeline, [{ type: "assistant_message", text: "done" }, { type: "reasoning", text: "thinking" }]);
  assert.equal(session.turnState, "idle");
  assert.equal(session.activeTurnId, null);
});

test("failed turn rejects and unsubscribes", async () => {
  const session = new FakeSession();
  const run = session.run("fail");
  session.stream.emit({ type: "turn_failed", provider: "fake", turnId: "turn-1", error: "upstream failed" });
  await assert.rejects(run, /upstream failed/);
  assert.equal(session.stream.listenerCount(), 0);
  complete(session);
});

test("canceled turn resolves canceled and cleans the coordinator", async () => {
  const session = new FakeSession();
  const run = session.run("cancel");
  session.stream.emit({ type: "turn_canceled", provider: "fake", turnId: "turn-1", reason: "interrupted" });
  const result = await run;
  assert.equal(result.canceled, true);
  assert.equal(session.turnState, "idle");
  await session.interrupt();
  await session.close();
  assert.equal(session.interrupted, true);
  assert.equal(session.closed, true);
});

test("events from another turn are ignored", async () => {
  const session = new FakeSession();
  const run = session.run("filter");
  session.stream.emit({ type: "timeline", provider: "fake", turnId: "turn-other", item: { type: "assistant_message", text: "wrong" } });
  session.stream.emit({ type: "timeline", provider: "fake", turnId: "turn-1", item: { type: "assistant_message", text: "right" } });
  complete(session);
  const result = await run;
  assert.equal(result.finalText, "right");
});

test("early data is buffered but an unscoped early terminal cannot settle the turn", async () => {
  const session = new FakeSession();
  const runner = {
    startTurn: async (prompt: AgentPromptInput, options?: AgentRunOptions) => {
      session.stream.emit({ type: "timeline", provider: "fake", item: { type: "assistant_message", text: "early" } });
      session.stream.emit({ type: "turn_completed", provider: "fake" });
      await Promise.resolve();
      return session.startTurn(prompt, options);
    },
    subscribe: session.subscribe.bind(session),
    getSessionId: () => persistence.sessionId,
  };
  const run = runProviderTurn({ ...runner, prompt: "early" });
  await Promise.resolve();
  assert.equal(session.stream.history.length, 2);
  session.stream.emit({ type: "turn_completed", provider: "fake", turnId: "turn-1" });
  const result = await run;
  assert.equal(result.finalText, "early");
});

test("concurrent turns are rejected before a second provider start", async () => {
  const session = new FakeSession();
  const first = session.run("first");
  await assert.rejects(session.run("second"), ConcurrentTurnError);
  complete(session);
  await first;
});

test("start failure rejects and leaves no subscription or active turn", async () => {
  const session = new FakeSession();
  const runner = {
    startTurn: async () => { throw new Error("start failed"); },
    subscribe: session.subscribe.bind(session),
    getSessionId: () => persistence.sessionId,
    coordinator: session.coordinator,
  };
  await assert.rejects(runProviderTurn({ ...runner, prompt: "bad" }), /start failed/);
  assert.equal(session.stream.listenerCount(), 0);
  assert.equal(session.coordinator.activeTurnId, null);
});

test("abort interrupts once, resolves canceled, and cleans listeners", async () => {
  const session = new FakeSession();
  const controller = new AbortController();
  const run = session.run("abort", { signal: controller.signal });
  controller.abort(new Error("user canceled"));
  const result = await run;
  assert.equal(result.canceled, true);
  assert.equal(session.interrupted, true);
  assert.equal(session.stream.listenerCount(), 0);
});

test("coordinator enforces lifecycle boundaries and idempotent finish", () => {
  const coordinator = new AgentTurnCoordinator();
  assert.equal(coordinator.state, "idle");
  coordinator.begin();
  assert.equal(coordinator.state, "starting");
  assert.throws(() => coordinator.begin(), ConcurrentTurnError);
  assert.throws(() => coordinator.bind(""), AgentSessionStateError);
  coordinator.bind("turn-1");
  coordinator.markInterrupting();
  assert.equal(coordinator.state, "interrupting");
  coordinator.finish();
  coordinator.finish();
  assert.equal(coordinator.state, "idle");
});

test("opaque legacy runtime notifications normalize into AgentStreamEvent", () => {
  assert.deepEqual(normalizeExternalEngineEvent({ type: "text-delta", text: "hi", turnId: "t" }, "claude-cli"), {
    type: "timeline", provider: "claude-cli", turnId: "t", item: { type: "assistant_message", text: "hi", partial: true },
  });
  assert.deepEqual(normalizeExternalEngineEvent({ type: "tool-result", id: "tool", output: "ok", isError: false }, "codex-cli", "t"), {
    type: "timeline", provider: "codex-cli", turnId: "t", item: { type: "tool_call", id: "tool", name: "external_tool", status: "completed", output: "ok" },
  });
});

test("the public event union follows the provider event categories", () => {
  const events: AgentStreamEvent[] = [
    { type: "thread_started", provider: "fake", sessionId: "s" },
    { type: "turn_started", provider: "fake", turnId: "t" },
    { type: "timeline", provider: "fake", item: { type: "reasoning", text: "x" } },
    { type: "reasoning", provider: "fake", text: "x" },
    { type: "usage_updated", provider: "fake", usage: {} },
    { type: "permission_requested", provider: "fake", request: { id: "p", kind: "tool", name: "shell" } },
    { type: "permission_resolved", provider: "fake", requestId: "p", resolution: { behavior: "allow" } },
    { type: "mode_changed", provider: "fake", currentModeId: null, availableModes: [] },
    { type: "model_changed", provider: "fake", runtimeInfo: { provider: "fake", sessionId: "s", model: "m" } },
    { type: "thinking_option_changed", provider: "fake", thinkingOptionId: null },
    { type: "provider_subagent", provider: "fake", event: { subagentId: "a", status: "started" } },
    { type: "attention_required", provider: "fake", reason: "permission", timestamp: new Date().toISOString() },
    { type: "error", provider: "fake", error: "e" },
    { type: "turn_canceled", provider: "fake", reason: "r" },
  ];
  assert.equal(events.length, 14);
});
