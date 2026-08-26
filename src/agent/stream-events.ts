import type {
  AgentPromptInput,
  AgentProvider,
  AgentRunOptions,
  AgentRunResult,
  AgentSessionStateSnapshot,
  AgentStreamEvent,
  AgentTimelineItem,
  AgentTurnState,
  AgentUsage,
} from "./provider-contract.js";

export type AgentEventListener = (event: AgentStreamEvent) => void;
export type AgentStream = Pick<{ subscribe(listener: AgentEventListener): () => void; streamHistory(): AsyncGenerator<AgentStreamEvent> }, "subscribe" | "streamHistory">;

export function getAgentStreamEventTurnId(event: AgentStreamEvent): string | undefined {
  return "turnId" in event ? event.turnId : undefined;
}

export function isTerminalAgentStreamEvent(event: AgentStreamEvent): boolean {
  return event.type === "turn_completed" || event.type === "turn_failed" || event.type === "turn_canceled";
}

function isActiveTurnState(state: AgentTurnState): boolean {
  return state === "starting" || state === "running" || state === "interrupting";
}

export class ConcurrentTurnError extends Error {
  readonly code = "CONCURRENT_TURN";

  constructor(message = "an Agent session already has an active turn") {
    super(message);
    this.name = "ConcurrentTurnError";
  }
}

export class AgentSessionStateError extends Error {
  readonly code = "INVALID_SESSION_STATE";

  constructor(message: string) {
    super(message);
    this.name = "AgentSessionStateError";
  }
}

interface ActiveTurn {
  readonly turnId: string | null;
  readonly state: Extract<AgentTurnState, "starting" | "running" | "interrupting">;
}

/**
 * Small provider-independent turn state machine. Providers may own a coordinator
 * and pass it to runProviderTurn so concurrent starts are rejected before a
 * second process request can be sent.
 */
export class AgentTurnCoordinator {
  private active: ActiveTurn | null = null;

  get state(): AgentTurnState {
    return this.active?.state ?? "idle";
  }

  get activeTurnId(): string | null {
    return this.active?.turnId ?? null;
  }

  begin(): void {
    if (this.active !== null) throw new ConcurrentTurnError();
    this.active = { state: "starting", turnId: null };
  }

  bind(turnId: string): void {
    if (turnId.trim() === "") throw new AgentSessionStateError("turn id must not be empty");
    if (this.active === null) throw new AgentSessionStateError("cannot bind a turn before it starts");
    if (this.active.turnId !== null && this.active.turnId !== turnId) {
      throw new AgentSessionStateError(`turn id changed from ${this.active.turnId} to ${turnId}`);
    }
    this.active = { state: "running", turnId };
  }

  markInterrupting(): void {
    if (this.active !== null) this.active = { ...this.active, state: "interrupting" };
  }

  finish(): void {
    this.active = null;
  }
}

export type ProviderFinalTextReducer = (params: {
  readonly current: string;
  readonly item: AgentTimelineItem;
}) => string;

export interface ProviderTurnRunner {
  startTurn(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<{ readonly turnId: string }>;
  subscribe(listener: AgentEventListener): () => void;
  getSessionId(): string | Promise<string>;
  readonly provider?: AgentProvider;
  readonly coordinator?: AgentTurnCoordinator;
  readonly getState?: () => AgentSessionStateSnapshot;
  interrupt?(): Promise<void>;
}

export interface RunProviderTurnOptions extends ProviderTurnRunner {
  readonly prompt: AgentPromptInput;
  readonly runOptions?: AgentRunOptions;
  readonly reduceFinalText?: ProviderFinalTextReducer;
}

interface TurnCompletion {
  readonly canceled: boolean;
  readonly usage?: AgentUsage;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (error: Error) => void;
} {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function assertRunnerCanStart(runner: ProviderTurnRunner): void {
  const snapshot = runner.getState?.();
  if (snapshot === undefined) return;
  if (snapshot.session === "closing" || snapshot.session === "closed") {
    throw new AgentSessionStateError(`cannot start a turn while the session is ${snapshot.session}`);
  }
  if (snapshot.turn !== "idle" && isActiveTurnState(snapshot.turn)) {
    throw new ConcurrentTurnError(`cannot start a turn while ${snapshot.activeTurnId ?? "another turn"} is active`);
  }
}

/**
 * Runs one provider turn with the Helm/Paseo ordering contract:
 * subscribe first, start second, then bind and replay buffered events.
 *
 * Events without a turn id are accepted while the turn is live. An unscoped
 * terminal/error event observed before startTurn returns is deliberately not
 * allowed to settle the new turn because its ownership cannot be proven.
 */
export async function runProviderTurn({
  prompt,
  runOptions,
  startTurn,
  subscribe,
  getSessionId,
  provider,
  coordinator,
  getState,
  interrupt,
  reduceFinalText = replaceFinalTextWithAssistantMessage,
}: RunProviderTurnOptions): Promise<AgentRunResult> {
  const signal = runOptions?.signal;
  if (signal?.aborted) {
    return {
      sessionId: await getSessionId(),
      finalText: "",
      timeline: [],
      canceled: true,
    };
  }

  const runner: ProviderTurnRunner = {
    startTurn,
    subscribe,
    getSessionId,
    ...(provider === undefined ? {} : { provider }),
    ...(coordinator === undefined ? {} : { coordinator }),
    ...(getState === undefined ? {} : { getState }),
    ...(interrupt === undefined ? {} : { interrupt }),
  };
  assertRunnerCanStart(runner);
  coordinator?.begin();

  const timeline: AgentTimelineItem[] = [];
  let finalText = "";
  let usage: AgentUsage | undefined;
  let turnId: string | undefined;
  let started = false;
  let settled = false;
  let canceled = false;
  let runError: Error | undefined;
  const bufferedEvents: AgentStreamEvent[] = [];
  const completion = deferred<TurnCompletion>();

  const settleCompleted = (nextUsage: AgentUsage | undefined): void => {
    if (settled) return;
    settled = true;
    usage = nextUsage ?? usage;
    completion.resolve({ canceled: false, ...(usage === undefined ? {} : { usage }) });
  };

  const settleCanceled = (): void => {
    if (settled) return;
    settled = true;
    canceled = true;
    completion.resolve({ canceled: true, ...(usage === undefined ? {} : { usage }) });
  };

  const settleFailed = (error: Error): void => {
    if (settled) return;
    settled = true;
    completion.reject(error);
  };

  const processEvent = (event: AgentStreamEvent): void => {
    if (settled || !started || turnId === undefined) return;
    if (provider !== undefined && event.provider !== provider) return;
    const eventTurnId = getAgentStreamEventTurnId(event);
    if (eventTurnId !== undefined && eventTurnId !== turnId) return;

    switch (event.type) {
      case "timeline":
        timeline.push(event.item);
        finalText = reduceFinalText({ current: finalText, item: event.item });
        return;
      case "reasoning":
        timeline.push({ type: "reasoning", text: event.text });
        return;
      case "usage_updated":
        usage = event.usage;
        return;
      case "turn_completed":
        settleCompleted(event.usage);
        return;
      case "turn_canceled":
        canceled = true;
        settleCanceled();
        return;
      case "turn_failed":
        settleFailed(new Error(event.error));
        return;
      case "error":
        settleFailed(new Error(event.error));
        return;
      default:
        return;
    }
  };

  const flushBufferedEvents = (): void => {
    const pending = bufferedEvents.splice(0);
    for (const event of pending) {
      if (settled) return;
      const eventTurnId = getAgentStreamEventTurnId(event);
      if (eventTurnId !== undefined && eventTurnId !== turnId) continue;
      if (eventTurnId === undefined && (isTerminalAgentStreamEvent(event) || event.type === "error")) continue;
      processEvent(event);
    }
  };

  let unsubscribe: (() => void) | undefined;
  const onEvent: AgentEventListener = (event) => {
    if (settled) return;
    if (!started) {
      bufferedEvents.push(event);
      return;
    }
    processEvent(event);
  };

  try {
    unsubscribe = subscribe(onEvent);
    const onAbort = (): void => {
      if (settled) return;
      coordinator?.markInterrupting();
      void interrupt?.().catch(() => undefined);
      settleCanceled();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const startedTurn = await startTurn(prompt, runOptions);
      if (startedTurn.turnId.trim() === "") throw new AgentSessionStateError("provider returned an empty turn id");
      turnId = startedTurn.turnId;
      started = true;
      coordinator?.bind(turnId);
      flushBufferedEvents();
      await completion.promise;
    } catch (error: unknown) {
      if (signal?.aborted) {
        settleCanceled();
      } else {
        runError = error instanceof Error ? error : new Error(String(error));
        settleFailed(runError);
      }
      await completion.promise.catch(() => undefined);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  } finally {
    unsubscribe?.();
    bufferedEvents.length = 0;
    coordinator?.finish();
  }

  if (runError !== undefined) throw runError;

  return {
    sessionId: await getSessionId(),
    finalText,
    timeline,
    ...(usage === undefined ? {} : { usage }),
    ...(canceled ? { canceled: true } : {}),
  };
}

export function replaceFinalTextWithAssistantMessage({
  current,
  item,
}: {
  readonly current: string;
  readonly item: AgentTimelineItem;
}): string {
  return item.type === "assistant_message" ? item.text : current;
}

export function appendOrReplaceGrowingAssistantMessage({
  current,
  item,
}: {
  readonly current: string;
  readonly item: AgentTimelineItem;
}): string {
  if (item.type !== "assistant_message") return current;
  if (!current) return item.text;
  return item.text.startsWith(current) ? item.text : `${current}${item.text}`;
}
