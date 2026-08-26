import type { CanUseTool, OnUserDialog, PermissionResult as SdkPermissionResult, UserDialogRequest as SdkUserDialogRequest } from '@anthropic-ai/claude-agent-sdk';
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
export type ThinkingConfig = {
    readonly type: 'adaptive';
    readonly display?: 'summarized' | 'omitted';
} | {
    readonly type: 'enabled';
    readonly budgetTokens?: number;
    readonly display?: 'summarized' | 'omitted';
} | {
    readonly type: 'disabled';
};
export type PermissionDestination = 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg';
export type PermissionBehavior = 'allow' | 'deny' | 'ask';
export type PermissionRule = {
    readonly toolName: string;
    readonly ruleContent?: string;
};
export type PermissionUpdate = {
    readonly type: 'addRules';
    readonly rules: readonly PermissionRule[];
    readonly behavior: PermissionBehavior;
    readonly destination: PermissionDestination;
} | {
    readonly type: 'replaceRules';
    readonly rules: readonly PermissionRule[];
    readonly behavior: PermissionBehavior;
    readonly destination: PermissionDestination;
} | {
    readonly type: 'removeRules';
    readonly rules: readonly PermissionRule[];
    readonly behavior: PermissionBehavior;
    readonly destination: PermissionDestination;
} | {
    readonly type: 'setMode';
    readonly mode: PermissionMode;
    readonly destination: PermissionDestination;
} | {
    readonly type: 'addDirectories';
    readonly directories: readonly string[];
    readonly destination: PermissionDestination;
} | {
    readonly type: 'removeDirectories';
    readonly directories: readonly string[];
    readonly destination: PermissionDestination;
};
export interface CanUseToolOptions {
    readonly signal: AbortSignal;
    readonly suggestions?: readonly PermissionUpdate[];
    readonly blockedPath?: string;
    readonly decisionReason?: string;
    readonly title?: string;
    readonly displayName?: string;
    readonly description?: string;
    readonly toolUseID: string;
    readonly agentID?: string;
    readonly requestId: string;
    readonly matchedAskRule?: {
        readonly source: string;
        readonly toolName: string;
        readonly ruleContent?: string;
    };
}
export interface PermissionRequest {
    readonly requestId: string;
    readonly toolName: string;
    readonly input: Record<string, unknown>;
    readonly suggestions?: readonly PermissionUpdate[];
    readonly blockedPath?: string;
    readonly decisionReason?: string;
    readonly title?: string;
    readonly displayName?: string;
    readonly description?: string;
    readonly toolUseId?: string;
    readonly agentId?: string;
    readonly matchedAskRule?: {
        readonly source: string;
        readonly toolName: string;
        readonly ruleContent?: string;
    };
    readonly permissionMode: PermissionMode;
}
export type PermissionResponse = {
    readonly behavior: 'allow';
    readonly updatedInput?: Record<string, unknown>;
    readonly updatedPermissions?: readonly PermissionUpdate[];
    readonly toolUseId?: string;
    readonly decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject';
} | {
    readonly behavior: 'deny';
    readonly message: string;
    readonly interrupt?: boolean;
    readonly toolUseId?: string;
    readonly decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject';
};
export interface UserDialogRequest {
    readonly requestId: string;
    readonly dialogKind: string;
    readonly payload: Record<string, unknown>;
    readonly toolUseId?: string;
}
export type UserDialogResponse = {
    readonly behavior: 'completed';
    readonly result: unknown;
} | {
    readonly behavior: 'cancelled';
};
export type PermissionRegistryState = 'pending' | 'resolved' | 'expired' | 'canceled' | 'unknown';
export declare class ControlError extends Error {
    readonly code: 'duplicate' | 'unknown' | 'timeout' | 'canceled' | 'invalid_input' | 'stale';
    constructor(code: ControlError['code'], message: string);
}
type TimerHandle = number | ReturnType<typeof setTimeout>;
interface TimerDriver {
    setTimeout(callback: () => void, delayMs: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}
export declare function toPermissionRequest(toolName: string, input: Record<string, unknown>, options: CanUseToolOptions, permissionMode: PermissionMode): PermissionRequest;
export declare function toSdkPermissionResult(response: PermissionResponse): SdkPermissionResult;
export type PermissionRequestCallback = (request: PermissionRequest) => PermissionResponse | Promise<PermissionResponse>;
export declare function createCanUseToolHandler(callback: PermissionRequestCallback, options: {
    readonly permissionMode: PermissionMode;
}): CanUseTool;
export declare function toUserDialogRequest(request: SdkUserDialogRequest, requestId: string): UserDialogRequest;
export type UserDialogCallback = (request: UserDialogRequest) => UserDialogResponse | Promise<UserDialogResponse>;
export declare function createOnUserDialogHandler(callback: UserDialogCallback): OnUserDialog;
export interface AskQuestionOption {
    readonly label: string;
    readonly description?: string;
}
export interface AskQuestion {
    readonly question: string;
    readonly header?: string;
    readonly options: readonly AskQuestionOption[];
    readonly multiSelect?: boolean;
    readonly allowOther?: boolean;
}
export interface AskUserQuestionRequest extends PermissionRequest {
    readonly kind: 'ask_user_question';
    readonly questions: readonly AskQuestion[];
}
export type AskUserQuestionResponse = {
    readonly behavior: 'completed';
    readonly answers: Readonly<Record<string, string | readonly string[]>>;
} | {
    readonly behavior: 'cancelled';
};
export declare function toAskUserQuestion(toolName: string, input: Record<string, unknown>, options: CanUseToolOptions, permissionMode?: PermissionMode): AskUserQuestionRequest;
export declare function applyAskUserAnswers(input: Record<string, unknown>, answers: Readonly<Record<string, string | readonly string[]>>): Record<string, unknown>;
export declare function askUserResponseToPermission(request: AskUserQuestionRequest, response: AskUserQuestionResponse): PermissionResponse;
export interface PermissionRegistryOptions {
    readonly clock?: () => number;
    readonly id?: () => string;
    readonly timer?: TimerDriver;
    readonly defaultTimeoutMs?: number;
}
export interface PermissionBeginOptions {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
}
export declare class PermissionRegistry {
    private readonly clock;
    private readonly idFactory;
    private readonly timer;
    private readonly defaultTimeoutMs;
    private readonly entries;
    private readonly states;
    constructor(options?: PermissionRegistryOptions);
    begin(request: PermissionRequest, options?: PermissionBeginOptions): Promise<PermissionResponse>;
    respond(requestId: string, response: PermissionResponse): {
        readonly ok: true;
    } | {
        readonly ok: false;
        readonly error: ControlError;
    };
    cancel(requestId: string): {
        readonly ok: true;
    } | {
        readonly ok: false;
        readonly error: ControlError;
    };
    cancelAll(): readonly string[];
    expireDue(now?: number): readonly string[];
    stateOf(requestId: string): PermissionRegistryState;
    pending(): readonly PermissionRequest[];
    private expireEntry;
    private cleanup;
    private finishResponse;
    private finishError;
}
export interface NextTurnRequest<T> {
    readonly id: string;
    readonly value: T;
    readonly epoch: number;
    readonly version: number;
}
export type NextTurnOperation = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly error: ControlError;
};
export declare class NextTurnStateMachine<T> {
    private currentValue;
    private pendingValue;
    private epochValue;
    private versionValue;
    private readonly idFactory;
    constructor(initial: T, options?: {
        readonly id?: () => string;
    });
    get current(): T;
    get pending(): T | undefined;
    get epoch(): number;
    get version(): number;
    request(value: T): NextTurnRequest<T>;
    commit(request: NextTurnRequest<T>): NextTurnOperation;
    rollback(request: NextTurnRequest<T>): NextTurnOperation;
    snapshot(): {
        readonly current: T;
        readonly pending?: T;
        readonly epoch: number;
        readonly version: number;
        readonly request?: NextTurnRequest<T>;
    };
}
export {};
//# sourceMappingURL=control.d.ts.map