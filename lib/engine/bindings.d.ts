import type { EngineSelection } from '../profile/types.js';
/** Current durable on-disk schema version for Engine Suite session bindings. */
export declare const EXTERNAL_ENGINE_BINDING_SCHEMA_VERSION = 2;
export interface ExternalEngineBinding {
    readonly sessionId: string;
    readonly engineId: string;
    readonly nativeSessionId: string;
    readonly runtimeRoot: string;
    readonly selection: EngineSelection;
    /** Host-owned executable configuration; credentials must never be supplied here. */
    readonly executable?: string;
    readonly args?: readonly string[];
}
/** Durable, secret-free mapping from Harness Session to a native Engine Session and runtime root. */
export declare class ExternalEngineBindingStore {
    private readonly file;
    constructor(file?: string);
    runtimeRoot(sessionId: string): string;
    get(sessionId: string): Promise<ExternalEngineBinding | undefined>;
    put(binding: ExternalEngineBinding): Promise<void>;
    remove(sessionId: string): Promise<void>;
    private read;
    private write;
}
//# sourceMappingURL=bindings.d.ts.map