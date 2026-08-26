export type EngineMcpTransport = 'stdio' | 'http' | 'sse';
export interface EngineSkillSet {
    readonly id: string;
    /** Claude plugin directories supplied explicitly by the profile. */
    readonly pluginDirs: string[];
    /** Additional trusted directories supplied explicitly by the profile. */
    readonly additionalDirectories: string[];
}
interface EngineMcpServerBase {
    readonly id: string;
    readonly name: string;
    /** Map of target env/header names to runtime-only credential references. */
    readonly credentialRefs?: Readonly<Record<string, string>>;
}
export interface EngineStdioMcpServer extends EngineMcpServerBase {
    readonly transport: 'stdio';
    readonly command?: string;
    readonly args?: string[];
    /** Static, non-secret values only. Secret values belong behind credentialRefs. */
    readonly environment?: Readonly<Record<string, string>>;
    readonly url?: never;
    readonly headers?: never;
}
export interface EngineHttpMcpServer extends EngineMcpServerBase {
    readonly transport: 'http';
    /** Required by validation; optional here so callers can perform runtime narrowing before normalization. */
    readonly url?: string;
    /** Static, non-secret values only. Secret values belong behind credentialRefs. */
    readonly headers?: Readonly<Record<string, string>>;
    readonly command?: never;
    readonly args?: never;
    readonly environment?: never;
}
export interface EngineSseMcpServer extends EngineMcpServerBase {
    readonly transport: 'sse';
    /** Required by validation; optional here so callers can perform runtime narrowing before normalization. */
    readonly url?: string;
    /** Static, non-secret values only. Secret values belong behind credentialRefs. */
    readonly headers?: Readonly<Record<string, string>>;
    readonly command?: never;
    readonly args?: never;
    readonly environment?: never;
}
export type EngineMcpServer = EngineStdioMcpServer | EngineHttpMcpServer | EngineSseMcpServer;
export interface EngineMcpSet {
    readonly id: string;
    readonly servers: EngineMcpServer[];
}
/** Process-local, secret-free registry for profile-referenced Skill and MCP sets. */
export declare class EngineAssetRegistry {
    private readonly skillSets;
    private readonly mcpSets;
    registerSkillSet(input: EngineSkillSet): EngineSkillSet;
    registerMcpSet(input: EngineMcpSet): EngineMcpSet;
    replaceSkillSets(inputs: readonly EngineSkillSet[]): void;
    replaceMcpSets(inputs: readonly EngineMcpSet[]): void;
    skillSet(id: string): EngineSkillSet;
    mcpSet(id: string): EngineMcpSet;
    listSkillSets(): readonly EngineSkillSet[];
    listMcpSets(): readonly EngineMcpSet[];
}
export {};
//# sourceMappingURL=assets.d.ts.map