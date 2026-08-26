import { isAbsolute, normalize } from 'node:path';
export class ClaudeSkillMaterializationError extends Error {
    code;
    path;
    constructor(code, path, detail) {
        super(`${code} at ${path}: ${detail}`);
        this.name = 'ClaudeSkillMaterializationError';
        this.code = code;
        this.path = path;
    }
}
function fail(code, path, detail) {
    throw new ClaudeSkillMaterializationError(code, path, detail);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function validateScope(value) {
    if (value === undefined || value === 'user')
        return;
    if (value === 'internal' || value === 'harness') {
        fail('CLAUDE_ASSET_SCOPE_FORBIDDEN', 'skills.scope', 'only user assets may be materialized');
    }
    fail('CLAUDE_SKILL_INVALID_FIELD', 'skills.scope', 'scope must be user, internal, or harness');
}
function normalizePath(value, path) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        fail('CLAUDE_SKILL_PATH_INVALID', path, 'path must be a non-empty string');
    }
    const trimmed = value.trim();
    if (trimmed.includes('\u0000'))
        fail('CLAUDE_SKILL_PATH_INVALID', path, 'path contains a NUL byte');
    if (!isAbsolute(trimmed))
        fail('CLAUDE_SKILL_PATH_NOT_ABSOLUTE', path, 'path must be absolute');
    const normalized = normalize(trimmed);
    const withoutTrailingSeparator = normalized.length > 1 ? normalized.replace(/[\\/]+$/u, '') : normalized;
    if (withoutTrailingSeparator === '.' || withoutTrailingSeparator.length === 0)
        fail('CLAUDE_SKILL_PATH_INVALID', path, 'path is invalid');
    return withoutTrailingSeparator;
}
function normalizeDirectoryList(value, path) {
    if (!Array.isArray(value))
        fail('CLAUDE_SKILL_INVALID_FIELD', path, 'must be an array of absolute paths');
    const seen = new Set();
    const result = [];
    value.forEach((entry, index) => {
        const normalized = normalizePath(entry, `${path}[${index}]`);
        if (!seen.has(normalized)) {
            seen.add(normalized);
            result.push(normalized);
        }
    });
    return result;
}
function readAssets(input) {
    if (!isRecord(input))
        fail('CLAUDE_SKILL_INVALID_CONFIG', 'skills', 'must be an object');
    validateScope(input['scope']);
    for (const field of ['systemPrompt', 'tools', 'agents']) {
        if (hasOwn(input, field))
            fail('CLAUDE_SKILL_UNSUPPORTED_FIELD', `skills.${field}`, 'field is not materialized by Claude skills');
    }
    const pluginDirs = input['pluginDirs'] === undefined ? undefined : normalizeDirectoryList(input['pluginDirs'], 'skills.pluginDirs');
    const additionalDirectories = input['additionalDirectories'] === undefined
        ? undefined
        : normalizeDirectoryList(input['additionalDirectories'], 'skills.additionalDirectories');
    return {
        ...(pluginDirs === undefined ? {} : { pluginDirs }),
        ...(additionalDirectories === undefined ? {} : { additionalDirectories }),
    };
}
/** Purely normalizes user-provided skill directories without filesystem access. */
export function normalizeClaudeSkillAssets(input) {
    return readAssets(input);
}
/** Materializes only explicit pluginDirs/additionalDirectories into native Claude SDK options. */
export function materializeClaudeSkills(input) {
    const normalized = readAssets(input);
    const plugins = normalized.pluginDirs === undefined
        ? undefined
        : normalized.pluginDirs.map(path => ({ type: 'local', path }));
    return {
        ...(plugins === undefined ? {} : { plugins }),
        ...(normalized.additionalDirectories === undefined ? {} : { additionalDirectories: [...normalized.additionalDirectories] }),
    };
}
//# sourceMappingURL=skills.js.map