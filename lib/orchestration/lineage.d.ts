export type ParentChildLineageStatus = 'running' | 'completed' | 'failed' | 'canceled' | 'archived' | 'detached';
export type ParentChildLineageEventType = 'progress' | 'result' | 'error' | 'cancel';
export interface ParentChildLineageDescriptor {
    readonly parentSessionId: string;
    readonly nativeTaskId: string;
    readonly childSessionId: string;
    readonly depth: number;
    readonly profile: string;
    readonly status: ParentChildLineageStatus;
    readonly createdAt?: string;
    readonly updatedAt?: string;
}
export interface ParentChildLineageEvent {
    readonly sequence: number;
    readonly parentSessionId: string;
    readonly nativeTaskId: string;
    readonly childSessionId: string;
    readonly type: ParentChildLineageEventType;
    readonly data?: string;
    readonly error?: string;
    readonly timestamp: string;
}
export interface ParentChildLineageDocument {
    readonly version: 1;
    readonly descriptors: readonly ParentChildLineageDescriptor[];
    readonly events: readonly ParentChildLineageEvent[];
}
export interface ParentChildLineageStore {
    create(descriptor: ParentChildLineageDescriptor): ParentChildLineageDescriptor;
    update(childSessionId: string, patch: Partial<Pick<ParentChildLineageDescriptor, 'status'>>): ParentChildLineageDescriptor;
    get(parentSessionId: string, nativeTaskId: string): ParentChildLineageDescriptor | undefined;
    getByChildSessionId(childSessionId: string): ParentChildLineageDescriptor | undefined;
    list(parentSessionId?: string): ParentChildLineageDescriptor[];
    append(input: Omit<ParentChildLineageEvent, 'sequence' | 'timestamp'> & {
        readonly timestamp?: string;
    }): ParentChildLineageEvent;
    replay(parentSessionId: string, afterSequence?: number): ParentChildLineageEvent[];
    subscribe(parentSessionId: string, listener: (event: ParentChildLineageEvent) => void): () => void;
    serialize(): string;
    flush(): Promise<void>;
}
export declare function createParentChildLineageStore(file?: string, initial?: ParentChildLineageDocument): ParentChildLineageStore;
export declare function loadParentChildLineageStore(file?: string): Promise<ParentChildLineageStore>;
//# sourceMappingURL=lineage.d.ts.map