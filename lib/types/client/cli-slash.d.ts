import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
interface InputTriggerCandidate {
    readonly id: string;
    readonly label: string;
    readonly detail?: string;
    readonly argumentHint?: string;
    readonly source?: 'command' | 'skill';
}
interface ClientSessionContext {
    readonly sessionId: string;
}
interface SubmitEnvelope {
    readonly images: number;
}
interface InputTriggerPick {
    readonly candidate: InputTriggerCandidate;
    readonly session: ClientSessionContext;
}
interface InputTriggerSource {
    readonly trigger: '/';
    readonly name: string;
    readonly order?: number;
    readonly showGroupTitle?: boolean;
    candidates(session: ClientSessionContext, request: {
        readonly query: string;
        readonly signal: AbortSignal;
    }): Promise<readonly InputTriggerCandidate[]>;
    onPick(pick: InputTriggerPick): unknown;
    matchEnter?(session: ClientSessionContext, line: string, signal: AbortSignal, envelope: SubmitEnvelope): Promise<unknown>;
    warm?(session: ClientSessionContext): void;
}
/** CLI-owned slash source; the host command source remains authoritative for native sessions. */
export declare function createCliSlashSource(ctx: ClientContext): InputTriggerSource;
export declare function mountCliSlashSource(ctx: ClientContext): () => void;
export {};
//# sourceMappingURL=cli-slash.d.ts.map