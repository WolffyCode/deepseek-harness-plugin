import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyCommand,
  mapSdkCommand,
  parseSlashInput,
  serializeSlashPayload,
  toForwardPayload,
} from '../src/claude/commands.js'

test('maps SDK slash commands and only SDK skills become skill commands', () => {
  assert.deepEqual(mapSdkCommand({ name: 'help', description: 'Help', argumentHint: '', aliases: ['h'] }), {
    name: 'help', id: 'help', displayName: 'help', description: 'Help', argumentHint: '', aliases: ['h'], category: 'skill', classificationSource: 'sdk',
  })
  assert.deepEqual(classifyCommand('root', { rootOnly: ['root'] }), { category: 'root-only', classificationSource: 'explicit' })
  assert.deepEqual(classifyCommand('session', { session: ['session'] }), { category: 'session', classificationSource: 'explicit' })
  assert.deepEqual(classifyCommand('inferred', { inferred: 'session' }), { category: 'session', classificationSource: 'inferred' })
  assert.deepEqual(classifyCommand('unknown'), { category: 'unknown', classificationSource: 'unknown' })
})

test('parses slash raw input with typed errors, quotes, escapes, unicode and trailing spaces', () => {
  const parsed = parseSlashInput(`/deploy  "New York" 'x y' empty'' a\\ b 你好   `)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.rawInput, `/deploy  "New York" 'x y' empty'' a\\ b 你好   `)
  assert.equal(parsed.commandName, 'deploy')
  assert.equal(parsed.argsRaw, `  "New York" 'x y' empty'' a\\ b 你好   `)
  assert.deepEqual(parsed.tokens, ['New York', 'x y', 'empty', '', 'a b', '你好'])
  assert.equal(parseSlashInput('').ok, false)
  assert.equal(parseSlashInput('   ').ok, false)
  assert.equal(parseSlashInput('deploy x').ok, false)
  assert.equal(parseSlashInput('/').ok, false)
  const unclosed = parseSlashInput(`/x "secret`)
  assert.equal(unclosed.ok, false)
  if (!unclosed.ok) {
    assert.equal(unclosed.code, 'unclosed_quote')
    assert.equal(unclosed.message.includes('secret'), false)
  }
  const dangling = parseSlashInput('/x abc\\')
  assert.equal(dangling.ok, false)
  if (!dangling.ok) assert.equal(dangling.code, 'dangling_escape')
})

test('forward payload preserves original raw input while serializer preserves token semantics', () => {
  const raw = `/echo  "a b" '' c\\ d`;
  const payload = toForwardPayload(raw)
  assert.equal(payload.ok, true)
  if (!payload.ok) return
  assert.equal(payload.rawInput, raw)
  assert.equal(payload.forwardRaw, raw)
  const serialized = serializeSlashPayload(payload)
  const reparsed = parseSlashInput(serialized)
  assert.equal(reparsed.ok, true)
  if (reparsed.ok) assert.deepEqual(reparsed.tokens, payload.tokens)
  assert.equal(payload.executed, false)
})

test('serialization and parse errors do not echo complete raw input', () => {
  const result = parseSlashInput('/secret super-secret-token')
  assert.equal(result.ok, true)
  const bad = parseSlashInput('/secret "super-secret-token')
  assert.equal(bad.ok, false)
  if (!bad.ok) {
    assert.equal(bad.message.includes('super-secret-token'), false)
    assert.equal(bad.rawInput, undefined)
  }
})
