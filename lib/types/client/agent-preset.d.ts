import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
export interface EngineSuiteAgentPresetOption {
    readonly id: string;
    readonly isDefault: boolean;
    readonly name?: string;
    readonly description?: string;
    readonly broken?: string;
}
export interface EngineSuiteAgentPresetFace {
    list(): Promise<readonly EngineSuiteAgentPresetOption[]>;
    select(sessionId: string, agentPreset: string): Promise<string>;
}
export declare function createEngineSuiteAgentPresetFace(connection: ConnectionHandle): EngineSuiteAgentPresetFace;
export declare function presetDisplayName(preset: EngineSuiteAgentPresetOption): string;
//# sourceMappingURL=agent-preset.d.ts.map