import { isAbsolute, normalize } from 'node:path'
import type { Options as ClaudeSdkOptions, SdkPluginConfig } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeAssetScope } from './mcp.js'

export interface CanonicalSkillAssets {
  readonly scope?: ClaudeAssetScope
  readonly pluginDirs?: readonly string[]
  readonly additionalDirectories?: readonly string[]
}

export interface NormalizedClaudeSkillAssets {
  readonly pluginDirs?: readonly string[]
  readonly additionalDirectories?: readonly string[]
}

export type ClaudeSkillsOptionsFragment = Readonly<Pick<ClaudeSdkOptions, 'plugins' | 'additionalDirectories'>>

export type ClaudeSkillErrorCode =
  | 'CLAUDE_ASSET_SCOPE_FORBIDDEN'
  | 'CLAUDE_SKILL_INVALID_CONFIG'
  | 'CLAUDE_SKILL_INVALID_FIELD'
  | 'CLAUDE_SKILL_PATH_INVALID'
  | 'CLAUDE_SKILL_PATH_NOT_ABSOLUTE'
  | 'CLAUDE_SKILL_UNSUPPORTED_FIELD'

export class ClaudeSkillMaterializationError extends Error {
  readonly code: ClaudeSkillErrorCode
  readonly path: string

  constructor(code: ClaudeSkillErrorCode, path: string, detail: string) {
    super(`${code} at ${path}: ${detail}`)
    this.name = 'ClaudeSkillMaterializationError'
    this.code = code
    this.path = path
  }
}

function fail(code: ClaudeSkillErrorCode, path: string, detail: string): never {
  throw new ClaudeSkillMaterializationError(code, path, detail)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function validateScope(value: unknown): void {
  if (value === undefined || value === 'user') return
  if (value === 'internal' || value === 'harness') {
    fail('CLAUDE_ASSET_SCOPE_FORBIDDEN', 'skills.scope', 'only user assets may be materialized')
  }
  fail('CLAUDE_SKILL_INVALID_FIELD', 'skills.scope', 'scope must be user, internal, or harness')
}

function normalizePath(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('CLAUDE_SKILL_PATH_INVALID', path, 'path must be a non-empty string')
  }
  const trimmed = value.trim()
  if (trimmed.includes('\u0000')) fail('CLAUDE_SKILL_PATH_INVALID', path, 'path contains a NUL byte')
  if (!isAbsolute(trimmed)) fail('CLAUDE_SKILL_PATH_NOT_ABSOLUTE', path, 'path must be absolute')
  const normalized = normalize(trimmed)
  const withoutTrailingSeparator = normalized.length > 1 ? normalized.replace(/[\\/]+$/u, '') : normalized
  if (withoutTrailingSeparator === '.' || withoutTrailingSeparator.length === 0) fail('CLAUDE_SKILL_PATH_INVALID', path, 'path is invalid')
  return withoutTrailingSeparator
}

function normalizeDirectoryList(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) fail('CLAUDE_SKILL_INVALID_FIELD', path, 'must be an array of absolute paths')
  const seen = new Set<string>()
  const result: string[] = []
  value.forEach((entry, index) => {
    const normalized = normalizePath(entry, `${path}[${index}]`)
    if (!seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  })
  return result
}

function readAssets(input: unknown): {
  readonly pluginDirs?: readonly string[]
  readonly additionalDirectories?: readonly string[]
} {
  if (!isRecord(input)) fail('CLAUDE_SKILL_INVALID_CONFIG', 'skills', 'must be an object')
  validateScope(input['scope'])
  for (const field of ['systemPrompt', 'tools', 'agents']) {
    if (hasOwn(input, field)) fail('CLAUDE_SKILL_UNSUPPORTED_FIELD', `skills.${field}`, 'field is not materialized by Claude skills')
  }
  const pluginDirs = input['pluginDirs'] === undefined ? undefined : normalizeDirectoryList(input['pluginDirs'], 'skills.pluginDirs')
  const additionalDirectories = input['additionalDirectories'] === undefined
    ? undefined
    : normalizeDirectoryList(input['additionalDirectories'], 'skills.additionalDirectories')
  return {
    ...(pluginDirs === undefined ? {} : { pluginDirs }),
    ...(additionalDirectories === undefined ? {} : { additionalDirectories }),
  }
}

/** Purely normalizes user-provided skill directories without filesystem access. */
export function normalizeClaudeSkillAssets(input: unknown): NormalizedClaudeSkillAssets {
  return readAssets(input)
}

/** Materializes only explicit pluginDirs/additionalDirectories into native Claude SDK options. */
export function materializeClaudeSkills(input: unknown): ClaudeSkillsOptionsFragment {
  const normalized = readAssets(input)
  const plugins: SdkPluginConfig[] | undefined = normalized.pluginDirs === undefined
    ? undefined
    : normalized.pluginDirs.map(path => ({ type: 'local', path }))
  return {
    ...(plugins === undefined ? {} : { plugins }),
    ...(normalized.additionalDirectories === undefined ? {} : { additionalDirectories: [...normalized.additionalDirectories] }),
  }
}
