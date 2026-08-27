import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type ReactElement } from 'react';
import { type EngineSuiteActivityStore } from './realtime-ui.js';
export interface EngineSuiteRealtimeActivityInjected {
    readonly activityStore: EngineSuiteActivityStore;
    readonly stop: () => Promise<void>;
}
export type EngineSuiteRealtimeActivityProps = PropsRuntime<'conversation.input.dock'> & EngineSuiteRealtimeActivityInjected;
export declare function EngineSuiteRealtimeActivity({ session, activityStore, stop }: EngineSuiteRealtimeActivityProps): ReactElement | null;
//# sourceMappingURL=EngineSuiteRealtimeActivity.d.ts.map