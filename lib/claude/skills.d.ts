import type { Options as ClaudeSdkOptions } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeAssetScope } from './mcp.js';
export interface CanonicalSkillAssets {
    readonly scope?: ClaudeAssetScope;
    readonly pluginDirs?: readonly string[];
    readonly additionalDirectories?: readonly string[];
}
export interface NormalizedClaudeSkillAssets {
    readonly pluginDirs?: readonly string[];
    readonly additionalDirectories?: readonly string[];
}
export type ClaudeSkillsOptionsFragment = Readonly<Pick<ClaudeSdkOptions, 'plugins' | 'additionalDirectories'>>;
export type ClaudeSkillErrorCode = 'CLAUDE_ASSET_SCOPE_FORBIDDEN' | 'CLAUDE_SKILL_INVALID_CONFIG' | 'CLAUDE_SKILL_INVALID_FIELD' | 'CLAUDE_SKILL_PATH_INVALID' | 'CLAUDE_SKILL_PATH_NOT_ABSOLUTE' | 'CLAUDE_SKILL_UNSUPPORTED_FIELD';
export declare class ClaudeSkillMaterializationError extends Error {
    readonly code: ClaudeSkillErrorCode;
    readonly path: string;
    constructor(code: ClaudeSkillErrorCode, path: string, detail: string);
}
/** Purely normalizes user-provided skill directories without filesystem access. */
export declare function normalizeClaudeSkillAssets(input: unknown): NormalizedClaudeSkillAssets;
/** Materializes only explicit pluginDirs/additionalDirectories into native Claude SDK options. */
export declare function materializeClaudeSkills(input: unknown): ClaudeSkillsOptionsFragment;
//# sourceMappingURL=skills.d.ts.map