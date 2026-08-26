export type EngineId = string;
export type EngineType = 'codex-cli' | 'claude-cli' | 'deepseek-native';
export interface EngineCapabilities {
    readonly streaming: boolean;
    readonly sessionResume: boolean;
    readonly modelDiscovery: boolean;
    readonly reasoningDiscovery: boolean;
    readonly approvals: boolean;
    readonly mcp: boolean;
    readonly skills: boolean;
    readonly backgroundAgent: boolean;
    readonly steer: boolean;
    readonly fork: boolean;
}
export interface EngineDefinition {
    readonly id: EngineId;
    readonly type: EngineType;
    readonly displayName: string;
    readonly executable?: string;
    readonly version?: string;
    readonly capabilities: EngineCapabilities;
}
export declare function assertEngineId(id: string): EngineId;
//# sourceMappingURL=types.d.ts.map