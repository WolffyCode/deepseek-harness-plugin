import assert from "node:assert/strict";
import { test } from "node:test";
import { ClaudeArchiveNotFoundError, createClaudeArchiveStore, createClaudePersistenceHandle, listClaudeSessionDescriptors, parseClaudePersistenceHandle, realClaudeSdkGateway, serializeClaudePersistenceHandle, type ClaudeSdkGateway } from "../src/claude/persistence.js";
import type { SessionStore } from "@anthropic-ai/claude-agent-sdk";

test("persistence handle validates and round-trips stably", () => {
  const handle = createClaudePersistenceHandle({ sessionId: "s", nativeHandle: "s", cwd: "/work", metadata: { z: "x", a: [2, 1] } });
  const json = serializeClaudePersistenceHandle(handle);
  assert.equal(json, '{"cwd":"/work","metadata":{"a":[2,1],"z":"x"},"nativeHandle":"s","provider":"claude-cli","sessionId":"s","version":1}');
  assert.deepEqual(parseClaudePersistenceHandle(json), handle);
  assert.notEqual(parseClaudePersistenceHandle(json), handle);
  assert.throws(() => createClaudePersistenceHandle({ sessionId: "s", nativeHandle: "", cwd: "/work" }));
  assert.throws(() => createClaudePersistenceHandle({ sessionId: "s", nativeHandle: "s", cwd: "work" }));
  assert.throws(() => createClaudePersistenceHandle({ sessionId: "s", nativeHandle: "s", cwd: "/work", metadata: { token: "x" } }));
  assert.throws(() => parseClaudePersistenceHandle('{"version":1,"provider":"claude-cli","sessionId":"s","nativeHandle":"s","cwd":"/w","__proto__":{}}'));
  assert.throws(() => parseClaudePersistenceHandle('{"version":1,"provider":"claude-cli","sessionId":"s","nativeHandle":"s","cwd":"/w","metadata":{"apiKey":"x"}}'));
});
test("gateway forwards list arguments and descriptors sort", async () => { let options: unknown; const gateway = { listSessions: async (input?: object) => { options = input; return [{ sessionId: "b", summary: "", lastModified: 1, cwd: "/w" }, { sessionId: "a", summary: "", lastModified: 1, cwd: "/w" }]; } }; assert.deepEqual(await listClaudeSessionDescriptors(gateway, { cwd: "/w", limit: 2, offset: 1 }), [{ sessionId: "a", summary: "", lastModified: 1, cwd: "/w", provider: "claude-cli", nativeSessionId: "a" }, { sessionId: "b", summary: "", lastModified: 1, cwd: "/w", provider: "claude-cli", nativeSessionId: "b" }]); assert.deepEqual(options, { dir: "/w", limit: 2, offset: 1 }); assert.equal(realClaudeSdkGateway.capability, "sdk-native"); });
test("gateway forwards every native method and page bounds", async () => { const calls: string[] = []; const info = { sessionId: "s", summary: "", lastModified: 1 }; const store = {} as SessionStore; const gateway: ClaudeSdkGateway = { capability: "sdk-native", listSessions: async (options) => { calls.push(`list:${options?.dir}`); return [info]; }, getSessionInfo: async (id, options) => { calls.push(`info:${id}:${options?.dir}`); return info; }, getSessionMessages: async (id, options) => { calls.push(`messages:${id}:${options?.offset}`); return []; }, importSessionToStore: async (id, destination, options) => { calls.push(`import:${id}:${destination === store}:${options?.batchSize}`); } }; assert.deepEqual(await gateway.listSessions({ dir: "/w" }), [info]); assert.deepEqual(await gateway.getSessionInfo("s", { dir: "/w" }), info); assert.deepEqual(await gateway.getSessionMessages("s", { offset: 2 }), []); await gateway.importSessionToStore("s", store, { batchSize: 3 }); assert.deepEqual(calls, ["list:/w", "info:s:/w", "messages:s:2", "import:s:true:3"]); await assert.rejects(() => listClaudeSessionDescriptors(gateway, { limit: -1 }), /limit/); await assert.rejects(() => listClaudeSessionDescriptors(gateway, { offset: 1.5 }), /offset/); });
test("archive is plugin-owned, idempotent, and not-found is explicit", () => {
  const handle = createClaudePersistenceHandle({ sessionId: "s", nativeHandle: "s", cwd: "/work" });
  const store = createClaudeArchiveStore([handle]);
  assert.deepEqual(store.archive(handle, "2020"), { handle, archivedAt: "2020" });
  assert.deepEqual(store.archive(handle, "later"), { handle, archivedAt: "2020" });
  assert.equal(store.unarchive(handle), true);
  assert.equal(store.unarchive(handle), false);
  assert.throws(() => store.archive(createClaudePersistenceHandle({ sessionId: "missing", nativeHandle: "missing", cwd: "/work" })), ClaudeArchiveNotFoundError);
});

import { ClaudeCapabilityError, getClaudeSessionHistory, importClaudeSessionToStore, type ClaudeImportedSession } from "../src/claude/persistence.js";
import { createClaudeProviderSession } from "../src/claude/adapter.js";
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

test("canonical persistence handles carry the native id and cwd used for resume", () => {
  const handle = createClaudePersistenceHandle({
    sessionId: "native-session",
    nativeHandle: "native-session",
    cwd: "/workspace/project",
    runtimeRoot: "/workspace/runtime",
    metadata: { engine: "claude-cli" },
  });
  assert.deepEqual(handle, {
    provider: "claude-cli",
    sessionId: "native-session",
    nativeHandle: "native-session",
    cwd: "/workspace/project",
    runtimeRoot: "/workspace/runtime",
    metadata: { engine: "claude-cli" },
  });
  const serialized = serializeClaudePersistenceHandle(handle);
  assert.equal(serialized, '{"cwd":"/workspace/project","metadata":{"engine":"claude-cli"},"nativeHandle":"native-session","provider":"claude-cli","runtimeRoot":"/workspace/runtime","sessionId":"native-session","version":1}');
  assert.deepEqual(parseClaudePersistenceHandle(serialized), handle);
});

test("history uses the native handle and enforces its persisted cwd", async () => {
  const calls: unknown[] = [];
  const messages = [{ type: "user", uuid: "u", session_id: "s", message: { role: "user", content: "hello" }, parent_tool_use_id: null, parent_agent_id: null }] as const;
  const gateway: ClaudeSdkGateway = {
    capability: "sdk-native",
    listSessions: async () => [],
    getSessionInfo: async () => undefined,
    getSessionMessages: async (sessionId, options) => {
      calls.push([sessionId, options]);
      return [...messages];
    },
    importSessionToStore: async () => undefined,
  };
  const handle = createClaudePersistenceHandle({ sessionId: "s", nativeHandle: "s", cwd: "/workspace/project" });
  assert.deepEqual(await getClaudeSessionHistory(gateway, handle, { includeSystemMessages: true, limit: 10 }), messages);
  assert.deepEqual(calls, [["s", { dir: "/workspace/project", includeSystemMessages: true, limit: 10 }]]);
  await assert.rejects(() => getClaudeSessionHistory(gateway, { ...handle, cwd: "relative" }), /cwd/);
});

test("import requires a real SessionStore and returns imported native history", async () => {
  const calls: unknown[] = [];
  const store = {
    append: async () => undefined,
    load: async () => null,
  };
  const descriptor = { sessionId: "s", summary: "Imported", lastModified: 10, cwd: "/workspace/project" };
  const gateway: ClaudeSdkGateway = {
    capability: "sdk-native",
    listSessions: async () => [],
    getSessionInfo: async (sessionId, options) => {
      calls.push(["info", sessionId, options]);
      return descriptor;
    },
    getSessionMessages: async (sessionId, options) => {
      calls.push(["history", sessionId, options]);
      return [];
    },
    importSessionToStore: async (sessionId, destination, options) => {
      calls.push(["import", sessionId, destination, options]);
    },
  };
  const handle = createClaudePersistenceHandle({ sessionId: "s", nativeHandle: "s", cwd: "/workspace/project" });
  await assert.rejects(
    () => importClaudeSessionToStore(gateway, { handle }),
    (error: unknown) => error instanceof ClaudeCapabilityError && error.capability === "session-import",
  );
  const imported: ClaudeImportedSession = await importClaudeSessionToStore(gateway, {
    handle,
    store,
    includeSubagents: false,
    batchSize: 25,
  });
  assert.equal(imported.handle.nativeHandle, "s");
  assert.deepEqual(imported.descriptor, { ...descriptor, provider: "claude-cli", nativeSessionId: "s" });
  assert.deepEqual(imported.history, []);
  assert.equal(calls[0] && (calls[0] as unknown[])[0], "import");
  assert.deepEqual(calls[0] && (calls[0] as unknown[]).slice(0, 2), ["import", "s"]);
});

test("archive state is keyed by a validated native handle and stays separate from SDK calls", () => {
  const store = createClaudeArchiveStore();
  const handle = createClaudePersistenceHandle({ sessionId: "s", nativeHandle: "s", cwd: "/workspace/project" });
  store.remember(handle);
  const archived = store.archive(handle, "2026-08-26T00:00:00.000Z");
  assert.deepEqual(archived, { handle, archivedAt: "2026-08-26T00:00:00.000Z" });
  assert.deepEqual(store.get(handle), archived);
  assert.equal(store.unarchive(handle), true);
  assert.equal(store.unarchive(handle), false);
  assert.throws(() => store.archive(createClaudePersistenceHandle({ sessionId: "missing", nativeHandle: "missing", cwd: "/workspace/project" })), ClaudeArchiveNotFoundError);
});

class PersistenceFakeQuery implements AsyncGenerator<SDKMessage, void> {
  readonly options: import('@anthropic-ai/claude-agent-sdk').Options
  constructor(options: import('@anthropic-ai/claude-agent-sdk').Options) { this.options = options }
  private done = false;
  private readonly waiters: Array<(result: IteratorResult<SDKMessage>) => void> = [];
  async next(): Promise<IteratorResult<SDKMessage>> {
    if (this.done) return { value: undefined as never, done: true };
    return new Promise(resolve => this.waiters.push(resolve));
  }
  async return(): Promise<IteratorResult<SDKMessage>> {
    this.done = true;
    while (this.waiters.length > 0) this.waiters.shift()!({ value: undefined as never, done: true });
    return { value: undefined as never, done: true };
  }
  async throw(error?: unknown): Promise<IteratorResult<SDKMessage>> { this.done = true; throw error; }
  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> { return this; }
  async interrupt(): Promise<void> { await this.return(); }
  async initializationResult(): Promise<Record<string, unknown>> { await new Promise<void>(resolve => setImmediate(resolve)); return {}; }
  async supportedCommands(): Promise<unknown[]> { return []; }
  async supportedModels(): Promise<unknown[]> { return []; }
  push(message: SDKMessage): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: message, done: false });
  }
}

test("ProviderSession exposes history and reconnects from its validated native handle", async () => {
  const queries: PersistenceFakeQuery[] = [];
  const session = createClaudeProviderSession({
    cwd: "/workspace/project",
    model: "glm-5.3-max",
    queryFactory: ({ options }) => {
      const query = new PersistenceFakeQuery(options);
      queries.push(query);
      return query as unknown as Query;
    },
  });
  await session.whenReady?.();
  const nativeSessionId = queries[0]?.options.sessionId;
  assert.equal(typeof nativeSessionId, "string");
  assert.deepEqual(session.persistenceHandle(), { provider: "claude-cli", sessionId: nativeSessionId, nativeHandle: nativeSessionId, cwd: "/workspace/project" });
  const history = await session.history?.();
  assert.deepEqual(history, []);
  const reconnected = await session.reconnect?.();
  assert.ok(reconnected !== undefined);
  await reconnected?.whenReady?.();
  assert.equal(queries[1]?.options.sessionId, undefined);
  assert.equal(queries[1]?.options.resume, nativeSessionId);
  assert.equal(reconnected?.sessionId, nativeSessionId);
  await reconnected?.close();
});
