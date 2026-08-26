import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client';
import type { EngineSuiteAgentPresetFace } from './agent-preset.js';
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
import { type ReactElement } from 'react';
export interface EngineSuiteComposerSelectorProps {
    readonly locked: boolean;
    readonly useSession: SnapshotSelectorHook<ConversationSnapshot>;
    readonly sessionId: string;
    readonly useSessions: SnapshotSelectorHook<SessionListState>;
    readonly agentPreset?: EngineSuiteAgentPresetFace;
}
export declare function EngineSuiteComposerSelector({ locked, useSession, sessionId, useSessions, agentPreset, }: EngineSuiteComposerSelectorProps): ReactElement | null;
//# sourceMappingURL=EngineSuiteComposerSelector.d.ts.map