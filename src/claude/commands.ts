import type { SlashCommand as SdkSlashCommand } from '@anthropic-ai/claude-agent-sdk'

export type CommandCategory = 'root-only' | 'session' | 'skill' | 'unknown'
export type ClassificationSource = 'sdk' | 'explicit' | 'inferred' | 'unknown'

export interface CommandClassification {
  readonly category: CommandCategory
  readonly classificationSource: ClassificationSource
}

export interface CommandClassificationMetadata {
  readonly rootOnly?: readonly string[]
  readonly session?: readonly string[]
  readonly inferred?: CommandCategory
}

export interface ClaudeCommand extends CommandClassification {
  readonly name: string
  readonly id: string
  readonly displayName: string
  readonly description: string
  readonly argumentHint: string
  readonly aliases: readonly string[]
}

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSdkSlashCommand(value: unknown): value is SdkSlashCommand {
  if (!isRecord(value)) return false
  const name = value['name']
  const description = value['description']
  const argumentHint = value['argumentHint']
  const aliases = value['aliases']
  return typeof name === 'string'
    && typeof description === 'string'
    && typeof argumentHint === 'string'
    && (aliases === undefined || (Array.isArray(aliases) && aliases.every(alias => typeof alias === 'string')))
}

export function classifyCommand(name: string, metadata: CommandClassificationMetadata = {}, sdkSkill = false): CommandClassification {
  if (sdkSkill) return { category: 'skill', classificationSource: 'sdk' }
  if (metadata.rootOnly?.includes(name)) return { category: 'root-only', classificationSource: 'explicit' }
  if (metadata.session?.includes(name)) return { category: 'session', classificationSource: 'explicit' }
  if (metadata.inferred !== undefined && metadata.inferred !== 'unknown' && metadata.inferred !== 'skill') return { category: metadata.inferred, classificationSource: 'inferred' }
  return { category: 'unknown', classificationSource: 'unknown' }
}

export function mapSdkCommand(command: unknown, metadata: CommandClassificationMetadata = {}): ClaudeCommand {
  if (!isSdkSlashCommand(command)) throw new TypeError('SDK returned an invalid slash command')
  const aliases = command.aliases === undefined ? [] : [...command.aliases]
  return Object.freeze({
    name: command.name,
    id: command.name,
    displayName: command.name,
    description: command.description,
    argumentHint: command.argumentHint,
    aliases: Object.freeze(aliases),
    ...classifyCommand(command.name, metadata, true),
  })
}

export type SlashParseErrorCode = 'empty' | 'not_slash' | 'only_slash' | 'unclosed_quote' | 'dangling_escape'
export interface SlashParseError {
  readonly ok: false
  readonly code: SlashParseErrorCode
  readonly message: string
  readonly position?: number
  readonly rawInput?: undefined
}
export interface SlashParseSuccess {
  readonly ok: true
  readonly rawInput: string
  readonly commandName: string
  readonly argsRaw: string
  readonly tokens: readonly string[]
}
export type SlashParseResult = SlashParseSuccess | SlashParseError
type ParsedTokens = { readonly tokens: readonly string[] } | SlashParseError

function isSlashParseError(value: ParsedTokens): value is SlashParseError {
  return 'ok' in value && value.ok === false
}

function parseTokens(argsRaw: string, offset: number): ParsedTokens {
  const tokens: string[] = []
  let token = ''
  let tokenStarted = false
  let quote: 'single' | 'double' | undefined
  let escaped = false
  for (let index = 0; index < argsRaw.length; index += 1) {
    const character = argsRaw[index]
    if (character === undefined) continue
    if (escaped) {
      token += character
      tokenStarted = true
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      tokenStarted = true
      continue
    }
    if (quote === 'single') {
      if (character === "'") quote = undefined
      else token += character
      continue
    }
    if (quote === 'double') {
      if (character === '"') quote = undefined
      else token += character
      continue
    }
    if (character === "'") {
      if (tokenStarted && token.length > 0) {
        tokens.push(token)
        token = ''
      }
      quote = 'single'
      tokenStarted = true
      continue
    }
    if (character === '"') {
      if (tokenStarted && token.length > 0) {
        tokens.push(token)
        token = ''
      }
      quote = 'double'
      tokenStarted = true
      continue
    }
    if (/\s/u.test(character)) {
      if (tokenStarted) {
        tokens.push(token)
        token = ''
        tokenStarted = false
      }
      continue
    }
    token += character
    tokenStarted = true
  }
  if (escaped) return { ok: false, code: 'dangling_escape', message: 'Slash input ends with an escape', position: offset + argsRaw.length - 1 }
  if (quote !== undefined) return { ok: false, code: 'unclosed_quote', message: 'Slash input contains an unclosed quote', position: offset + argsRaw.length }
  if (tokenStarted) tokens.push(token)
  return { tokens }
}

export function parseSlashInput(rawInput: string): SlashParseResult {
  if (rawInput.length === 0 || /^\s+$/u.test(rawInput)) return { ok: false, code: 'empty', message: 'Slash input is empty' }
  if (rawInput[0] !== '/') return { ok: false, code: 'not_slash', message: 'Slash input must start with /' }
  if (rawInput.length === 1) return { ok: false, code: 'only_slash', message: 'Slash input has no command name' }
  let commandEnd = 1
  while (commandEnd < rawInput.length) {
    const character = rawInput[commandEnd]
    if (character === undefined || /\s/u.test(character)) break
    commandEnd += 1
  }
  if (commandEnd === 1) return { ok: false, code: 'only_slash', message: 'Slash input has no command name' }
  const commandName = rawInput.slice(1, commandEnd)
  const argsRaw = rawInput.slice(commandEnd)
  const parsedTokens = parseTokens(argsRaw, commandEnd)
  if (isSlashParseError(parsedTokens)) return parsedTokens
  return { ok: true, rawInput, commandName, argsRaw, tokens: parsedTokens.tokens }
}

export interface SlashForwardPayload extends SlashParseSuccess {
  readonly forwardRaw: string
  readonly executed: false
}

export function toForwardPayload(rawInput: string): SlashForwardPayload | SlashParseError {
  const parsed = parseSlashInput(rawInput)
  if (!parsed.ok) return parsed
  return Object.freeze({ ...parsed, forwardRaw: rawInput, executed: false })
}

function serializeToken(token: string): string {
  if (token.length > 0 && /^[^\s'"\\]+$/u.test(token)) return token
  return `'${token.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

export function serializeSlashPayload(payload: SlashForwardPayload): string {
  if (payload.tokens.length === 0) return `/${payload.commandName}`
  return `/${payload.commandName} ${payload.tokens.map(serializeToken).join(' ')}`
}
