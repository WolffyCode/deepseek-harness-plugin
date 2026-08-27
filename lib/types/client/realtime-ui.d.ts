import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { EngineSuiteSelectionRequest } from '../types.js';
/** One provider-neutral visual lifecycle for the live activity surface. */
export type EngineSuiteActivityPhase = 'idle' | 'working' | 'thinking' | 'tool' | 'approval' | 'question' | 'completed' | 'failed' | 'cancelled';
export type EngineSuiteActivityItemKind = 'assistant' | 'reasoning' | 'tool-call' | 'tool-result' | 'approval' | 'question' | 'error' | 'cancelled';
export type EngineSuiteActivityItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface EngineSuiteActivityItem {
    readonly id: string;
    readonly kind: EngineSuiteActivityItemKind;
    readonly status: EngineSuiteActivityItemStatus;
    readonly title: string;
    readonly detail?: string;
    readonly text?: string;
    readonly callId?: string;
    readonly seq?: number;
}
export interface EngineSuiteRealtimeSnapshot {
    readonly sessionId: string;
    readonly phase: EngineSuiteActivityPhase;
    readonly working: boolean;
    readonly stopAvailable: boolean;
    readonly liveText: string;
    readonly turn: number | null;
    readonly step: number | null;
    readonly terminal: 'completed' | 'failed' | 'cancelled' | null;
    readonly selection?: EngineSuiteSelectionRequest;
    readonly events: readonly EngineSuiteActivityItem[];
    readonly ariaLabel: string;
}
export declare function activityPhaseLabel(phase: EngineSuiteActivityPhase): string;
/**
 * Merge a provider increment without assuming whether it is a delta or a
 * cumulative prefix. This is deliberately content based: no timer can make a
 * final response look streamed, and a replayed prefix cannot duplicate text.
 */
export declare function mergeIncrementalText(current: string, incoming: string): string;
export declare function mergeIncrementalChunks(chunks: readonly string[]): string;
/**
 * Convert the Host's incrementally published ConversationSnapshot into the
 * single Codex-style activity language shared by Claude, Codex, and DeepSeek.
 * The snapshot is the live source; it is never rebuilt from final text.
 */
export declare function createEngineSuiteRealtimeSnapshot(snapshot: ConversationSnapshot, selection?: EngineSuiteSelectionRequest): EngineSuiteRealtimeSnapshot;
export interface EngineSuiteActivityStore {
    getSnapshot(sessionId: string): EngineSuiteRealtimeSnapshot | undefined;
    subscribe(sessionId: string, listener: () => void): () => void;
    publish(sessionId: string, snapshot: EngineSuiteRealtimeSnapshot): void;
    clear(sessionId?: string): void;
}
/** Client-owned mirror for activity that survives a slot render boundary. */
export declare function createEngineSuiteActivityStore(): EngineSuiteActivityStore;
export interface EngineSuiteActivityAriaAttributes {
    readonly role: 'status';
    readonly ariaLive: 'polite';
    readonly dataState: EngineSuiteActivityPhase;
}
export declare function activityAriaAttributes(phase: EngineSuiteActivityPhase): EngineSuiteActivityAriaAttributes;
export declare function activityDetail(value: unknown): string;
export declare function activityStep(snapshot: ConversationSnapshot): number | undefined;
export declare function activityNodeStep(node: {
    readonly data: unknown;
}): number | undefined;
//# sourceMappingURL=realtime-ui.d.ts.map