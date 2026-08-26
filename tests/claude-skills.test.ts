import assert from 'node:assert/strict'
import test from 'node:test'
import {
  materializeClaudeSkills,
  normalizeClaudeSkillAssets,
  type CanonicalSkillAssets,
} from '../src/claude/skills.js'

test('normalizes, deduplicates, and materializes only explicit user skill directories', () => {
  const input: CanonicalSkillAssets = {
    pluginDirs: ['/workspace/plugins/../plugins/alpha', '/workspace/plugins/alpha'],
    additionalDirectories: ['/workspace/additional', '/workspace/additional/./'],
  }
  const before = structuredClone(input)

  assert.deepEqual(normalizeClaudeSkillAssets(input), {
    pluginDirs: ['/workspace/plugins/alpha'],
    additionalDirectories: ['/workspace/additional'],
  })
  assert.deepEqual(materializeClaudeSkills(input), {
    plugins: [{ type: 'local', path: '/workspace/plugins/alpha' }],
    additionalDirectories: ['/workspace/additional'],
  })
  assert.deepEqual(input, before)
})

test('omits unset fields and emits explicit empty arrays without prompt or tool policy', () => {
  assert.deepEqual(materializeClaudeSkills({}), {})
  assert.deepEqual(materializeClaudeSkills({ pluginDirs: [], additionalDirectories: [] }), {
    plugins: [],
    additionalDirectories: [],
  })
})

test('rejects internal assets and invalid paths with stable diagnostics', () => {
  assert.throws(
    () => materializeClaudeSkills({ scope: 'harness', pluginDirs: ['/workspace/plugin'] }),
    error => error instanceof Error && error.message.includes('CLAUDE_ASSET_SCOPE_FORBIDDEN') && error.message.includes('skills.scope'),
  )
  assert.throws(
    () => materializeClaudeSkills({ pluginDirs: ['relative/plugin'] }),
    error => error instanceof Error && error.message.includes('CLAUDE_SKILL_PATH_NOT_ABSOLUTE') && error.message.includes('skills.pluginDirs[0]'),
  )
  assert.throws(
    () => materializeClaudeSkills({ additionalDirectories: ['/workspace/\u0000unsafe'] }),
    error => error instanceof Error && error.message.includes('CLAUDE_SKILL_PATH_INVALID') && error.message.includes('skills.additionalDirectories[0]'),
  )
})
