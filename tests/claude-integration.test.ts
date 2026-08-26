import test from "node:test";
import assert from "node:assert/strict";
import type { ClaudeAdapterEvent, ClaudeAgentSession, ClaudeAdapterOptions, ClaudeCatalog, ClaudeThinkingOption, ClaudePersistenceHandle } from "../src/claude/types.js";
import { createClaudeArchiveStore, type ClaudeSdkGateway } from "../src/claude/persistence.js";
import { createEngineSuiteRuntime, type EngineSuiteRuntime } from "../src/engine-suite.js";

const catalog: ClaudeCatalog = { models: [], commands: [], modes: [], skills: [], mcpServers: [], capabilities: [] };
class FakeSession implements ClaudeAgentSession {
  readonly sessionId = undefined;
  readonly capabilities = {};
  readonly catalog = catalog;
  readonly calls: string[] = [];
  private listeners = new Set<(event: ClaudeAdapterEvent) => void>();
  private n = 0;
  private closed = false;
  persistenceHandle() { return { provider: "claude-cli" as const, sessionId: "persisted-session", nativeHandle: "native-fallback", cwd: "/tmp" }; }
  subscribe(listener: (event: ClaudeAdapterEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event: ClaudeAdapterEvent): void { for (const listener of this.listeners) listener(event); }
  async startTurn(prompt: string): Promise<{ readonly turnId: string }> { this.calls.push(`start:${prompt}`); const turnId = `turn-${++this.n}`; this.emit({ type: "turn_started", turnId }); this.emit({ type: "timeline", turnId, item: { type: "assistant_message", text: "chunk", partial: true } }); return { turnId }; }
  completeTurn(turnId = `turn-${this.n}`): void { this.emit({ type: "turn_completed", turnId, usage: { inputTokens: 2, outputTokens: 3 } }); }
  async run(): Promise<never> { throw new Error("unused"); }
  async history(): Promise<readonly []> { return []; }
  async reconnect(): Promise<ClaudeAgentSession> { return this; }
  async interrupt(): Promise<void> { this.calls.push("interrupt"); }
  async close(): Promise<void> { if (!this.closed) { this.closed = true; this.calls.push("close"); } }
  async setMode(mode: string): Promise<void> { this.calls.push(`mode:${mode}`); }
  async setModel(model?: string): Promise<void> { this.calls.push(`model:${model ?? ""}`); }
  async setThinking(thinking: ClaudeThinkingOption): Promise<void> { this.calls.push(`thinking:${thinking.type}`); }
  async setPermissionMode(): Promise<void> {}
  respondToPermission(): boolean { return false; }
  respondToUserQuestion(): boolean { return false; }
  pendingPermissions(): readonly never[] { return []; }
  listCommands(): readonly never[] { return []; }
  async refreshCatalog(): Promise<ClaudeCatalog> { return catalog; }
  async steer(): Promise<{ status: "unavailable" }> { return { status: "unavailable" }; }
}

test("Claude EngineSuite uses injected session factory and bridges native events", async () => {
  const created: ClaudeAdapterOptions[] = [];
  const session = new FakeSession();
  const suite = createEngineSuiteRuntime({ claudeSessionFactory: (options: ClaudeAdapterOptions) => { created.push(options); return session; } });
  suite.providers.register({ id: "p", engineId: "claude-cli", name: "P", baseUri: "https://example.test", credentialRef: "c" });
  suite.models.register({ id: "m", engineId: "claude-cli", providerId: "p", modelId: "claude-test", reasoningOptions: [{ id: "high" }], source: "manual" });
  const events: unknown[] = [];
  const opened = await suite.openEngine({ engineId: "claude-cli", providerId: "p", modelRecordId: "m", reasoningEffort: "high" }, { apiKey: "secret", cwd: "/tmp", resumeThreadId: "resume" });
  const off = opened.runtime.onEvent(event => events.push(event));
  assert.equal(opened.nativeSessionId, "native-fallback");
  assert.deepEqual(created[0], { cwd: "/tmp", model: "claude-test", effort: "high", permissionMode: "default", baseUri: "https://example.test", authToken: "secret", resumeSessionId: "resume", persistSession: true });
  await opened.runtime.startTurn("hello");
  const beforeCompletion = events.map(event => (event as { type: string }).type);
  assert.deepEqual(beforeCompletion, ["turn_started", "timeline"]);
  session.emit({ type: "timeline", turnId: "turn-1", item: { type: "reasoning", text: "think" } });
  session.emit({ type: "timeline", turnId: "turn-1", item: { type: "tool_call", id: "tool", name: "bash", arguments: "{}" } });
  session.emit({ type: "usage_updated", turnId: "turn-1", usage: { inputTokens: 1 } });
  assert.deepEqual(events.map(event => (event as { type: string }).type), ["turn_started", "timeline", "timeline", "timeline", "usage_updated"]);
  const interrupts = [opened.runtime.interrupt(), opened.runtime.interrupt()];
  await Promise.all(interrupts);
  assert.equal(session.calls.filter(call => call === "interrupt").length, 1);
  session.completeTurn("turn-1");
  assert.equal(events.at(-1) && (events.at(-1) as { type: string }).type, "turn_completed");
  await opened.runtime.startTurn("second");
  await Promise.all([opened.runtime.interrupt(), opened.runtime.interrupt()]);
  assert.equal(session.calls.filter(call => call === "interrupt").length, 2);
  await opened.close(); await opened.close(); off();
  assert.deepEqual(session.calls.filter(call => call === "close"), ["close"]);
});

test("Claude EngineSuite materializes profile assets and lets per-call overrides win", async () => {
  const created: ClaudeAdapterOptions[] = [];
  const suite = createEngineSuiteRuntime({ claudeSessionFactory: (options: ClaudeAdapterOptions) => {
    created.push(options);
    return new FakeSession();
  } });
  suite.providers.register({ id: "assets-provider", engineId: "claude-cli", name: "Assets Provider", baseUri: "https://example.test", credentialRef: "credential-ref" });
  suite.models.register({ id: "assets-model", engineId: "claude-cli", providerId: "assets-provider", modelId: "claude-assets", reasoningOptions: [{ id: "high" }], source: "manual" });
  suite.assets.registerMcpSet({ id: "profile-mcp", servers: [{ id: "profile-server", name: "profile-server", transport: "stdio", command: "profile-command" }] });
  suite.assets.registerSkillSet({ id: "profile-skills", pluginDirs: ["/profile/plugin"], additionalDirectories: ["/profile/dir"] });
  const overrideMcp = suite.assets.registerMcpSet({ id: "override-mcp", servers: [{ id: "override-server", name: "override-server", transport: "http", url: "https://override.example.test", headers: { "x-tenant": "override" } }] });
  const overrideSkills = { id: "override-skills", pluginDirs: ["/override/plugin"], additionalDirectories: ["/override/dir"] };
  suite.profiles.register({ id: "assets-profile", selection: { engineId: "claude-cli", providerId: "assets-provider", modelRecordId: "assets-model", reasoningEffort: "high" }, mcpSetRef: "profile-mcp", skillSetRef: "profile-skills" });

  const opened = await suite.openEngine({ engineId: "claude-cli", providerId: "assets-provider", modelRecordId: "assets-model", reasoningEffort: "high" }, {
    apiKey: "runtime-secret",
    cwd: "/tmp",
    mcpSet: overrideMcp,
    skillSet: overrideSkills,
    internalMcpSet: { id: "internal", servers: [{ id: "internal-server", name: "internal-server", transport: "stdio", command: "internal-command" }] },
  });
  try {
    assert.deepEqual(created[0]?.mcpServers, {
      "override-server": { type: "http", url: "https://override.example.test", headers: { "x-tenant": "override" } },
    });
    assert.deepEqual(created[0]?.skillPlugins, ["/override/plugin"]);
    assert.deepEqual(created[0]?.additionalDirectories, ["/override/dir"]);
    assert.equal(JSON.stringify(created[0]).includes("internal-command"), false);
  } finally {
    await opened.close();
  }
});


test("EngineSuite exposes Claude list/history/import/archive and explicit resume/reconnect operations", async () => {
  const created: ClaudeAdapterOptions[] = [];
  const archive = createClaudeArchiveStore();
  const gateway: ClaudeSdkGateway = {
    capability: "sdk-native",
    listSessions: async () => [{ sessionId: "native-list", summary: "Existing", lastModified: 20, cwd: "/tmp" }],
    getSessionInfo: async () => ({ sessionId: "native-list", summary: "Existing", lastModified: 20, cwd: "/tmp" }),
    getSessionMessages: async () => [],
    importSessionToStore: async () => undefined,
  };
  const suite = createEngineSuiteRuntime({
    claudeSdkGateway: gateway,
    claudeArchiveStore: archive,
    claudeSessionFactory: (options: ClaudeAdapterOptions) => {
      created.push(options);
      return new FakeSession();
    },
  });
  suite.providers.register({ id: "persistence-provider", engineId: "claude-cli", name: "Persistence", baseUri: "https://example.test", credentialRef: "credential" });
  suite.models.register({ id: "persistence-model", engineId: "claude-cli", providerId: "persistence-provider", modelId: "glm-5.3-max", reasoningOptions: [{ id: "high" }], source: "manual" });
  const selection = { engineId: "claude-cli", providerId: "persistence-provider", modelRecordId: "persistence-model", reasoningEffort: "high" } as const;
  const listed = await suite.listClaudeSessions({ cwd: "/tmp" });
  assert.equal(listed[0]?.nativeSessionId, "native-list");
  const handle: ClaudePersistenceHandle = { provider: "claude-cli", sessionId: "native-list", nativeHandle: "native-list", cwd: "/tmp" };
  assert.deepEqual(await suite.getClaudeSessionHistory(handle), []);
  const store = { append: async () => undefined, load: async () => null };
  const imported = await suite.importClaudeSession({ handle, store });
  assert.equal(imported.handle.nativeHandle, "native-list");
  const archived = suite.archiveClaudeSession(handle, "2026-08-26T00:00:00.000Z");
  assert.equal(archived.handle.cwd, "/tmp");
  assert.equal(suite.unarchiveClaudeSession(handle), true);
  const resumed = await suite.resumeClaudeSession(selection, { apiKey: "secret", handle });
  assert.equal(resumed.nativeSessionId, "native-fallback");
  await resumed.close();
  const reconnected = await suite.reconnectClaudeSession(selection, { apiKey: "secret", handle });
  assert.equal(reconnected.nativeSessionId, "native-fallback");
  await reconnected.close();
  assert.equal(created.length, 2);
  assert.equal(created[0]?.resumeSessionId, "native-list");
});

test("EngineSuite import returns a capability error when no Host SessionStore is supplied", async () => {
  const gateway: ClaudeSdkGateway = {
    capability: "sdk-native",
    listSessions: async () => [],
    getSessionInfo: async () => undefined,
    getSessionMessages: async () => [],
    importSessionToStore: async () => undefined,
  };
  const suite = createEngineSuiteRuntime({ claudeSdkGateway: gateway });
  const handle: ClaudePersistenceHandle = { provider: "claude-cli", sessionId: "s", nativeHandle: "s", cwd: "/tmp" };
  await assert.rejects(() => suite.importClaudeSession({ handle }), /session-import/);
});
