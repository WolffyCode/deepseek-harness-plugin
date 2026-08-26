export type CommandCategory = 'root-only' | 'session' | 'skill' | 'unknown';
export type ClassificationSource = 'sdk' | 'explicit' | 'inferred' | 'unknown';
export interface CommandClassification {
    readonly category: CommandCategory;
    readonly classificationSource: ClassificationSource;
}
export interface CommandClassificationMetadata {
    readonly rootOnly?: readonly string[];
    readonly session?: readonly string[];
    readonly inferred?: CommandCategory;
}
export interface ClaudeCommand extends CommandClassification {
    readonly name: string;
    readonly id: string;
    readonly displayName: string;
    readonly description: string;
    readonly argumentHint: string;
    readonly aliases: readonly string[];
}
export declare function classifyCommand(name: string, metadata?: CommandClassificationMetadata, sdkSkill?: boolean): CommandClassification;
export declare function mapSdkCommand(command: unknown, metadata?: CommandClassificationMetadata): ClaudeCommand;
export type SlashParseErrorCode = 'empty' | 'not_slash' | 'only_slash' | 'unclosed_quote' | 'dangling_escape';
export interface SlashParseError {
    readonly ok: false;
    readonly code: SlashParseErrorCode;
    readonly message: string;
    readonly position?: number;
    readonly rawInput?: undefined;
}
export interface SlashParseSuccess {
    readonly ok: true;
    readonly rawInput: string;
    readonly commandName: string;
    readonly argsRaw: string;
    readonly tokens: readonly string[];
}
export type SlashParseResult = SlashParseSuccess | SlashParseError;
export declare function parseSlashInput(rawInput: string): SlashParseResult;
export interface SlashForwardPayload extends SlashParseSuccess {
    readonly forwardRaw: string;
    readonly executed: false;
}
export declare function toForwardPayload(rawInput: string): SlashForwardPayload | SlashParseError;
export declare function serializeSlashPayload(payload: SlashForwardPayload): string;
//# sourceMappingURL=commands.d.ts.map