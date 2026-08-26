function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSdkSlashCommand(value) {
    if (!isRecord(value))
        return false;
    const name = value['name'];
    const description = value['description'];
    const argumentHint = value['argumentHint'];
    const aliases = value['aliases'];
    return typeof name === 'string'
        && typeof description === 'string'
        && typeof argumentHint === 'string'
        && (aliases === undefined || (Array.isArray(aliases) && aliases.every(alias => typeof alias === 'string')));
}
export function classifyCommand(name, metadata = {}, sdkSkill = false) {
    if (sdkSkill)
        return { category: 'skill', classificationSource: 'sdk' };
    if (metadata.rootOnly?.includes(name))
        return { category: 'root-only', classificationSource: 'explicit' };
    if (metadata.session?.includes(name))
        return { category: 'session', classificationSource: 'explicit' };
    if (metadata.inferred !== undefined && metadata.inferred !== 'unknown' && metadata.inferred !== 'skill')
        return { category: metadata.inferred, classificationSource: 'inferred' };
    return { category: 'unknown', classificationSource: 'unknown' };
}
export function mapSdkCommand(command, metadata = {}) {
    if (!isSdkSlashCommand(command))
        throw new TypeError('SDK returned an invalid slash command');
    const aliases = command.aliases === undefined ? [] : [...command.aliases];
    return Object.freeze({
        name: command.name,
        id: command.name,
        displayName: command.name,
        description: command.description,
        argumentHint: command.argumentHint,
        aliases: Object.freeze(aliases),
        ...classifyCommand(command.name, metadata, true),
    });
}
function isSlashParseError(value) {
    return 'ok' in value && value.ok === false;
}
function parseTokens(argsRaw, offset) {
    const tokens = [];
    let token = '';
    let tokenStarted = false;
    let quote;
    let escaped = false;
    for (let index = 0; index < argsRaw.length; index += 1) {
        const character = argsRaw[index];
        if (character === undefined)
            continue;
        if (escaped) {
            token += character;
            tokenStarted = true;
            escaped = false;
            continue;
        }
        if (character === '\\') {
            escaped = true;
            tokenStarted = true;
            continue;
        }
        if (quote === 'single') {
            if (character === "'")
                quote = undefined;
            else
                token += character;
            continue;
        }
        if (quote === 'double') {
            if (character === '"')
                quote = undefined;
            else
                token += character;
            continue;
        }
        if (character === "'") {
            if (tokenStarted && token.length > 0) {
                tokens.push(token);
                token = '';
            }
            quote = 'single';
            tokenStarted = true;
            continue;
        }
        if (character === '"') {
            if (tokenStarted && token.length > 0) {
                tokens.push(token);
                token = '';
            }
            quote = 'double';
            tokenStarted = true;
            continue;
        }
        if (/\s/u.test(character)) {
            if (tokenStarted) {
                tokens.push(token);
                token = '';
                tokenStarted = false;
            }
            continue;
        }
        token += character;
        tokenStarted = true;
    }
    if (escaped)
        return { ok: false, code: 'dangling_escape', message: 'Slash input ends with an escape', position: offset + argsRaw.length - 1 };
    if (quote !== undefined)
        return { ok: false, code: 'unclosed_quote', message: 'Slash input contains an unclosed quote', position: offset + argsRaw.length };
    if (tokenStarted)
        tokens.push(token);
    return { tokens };
}
export function parseSlashInput(rawInput) {
    if (rawInput.length === 0 || /^\s+$/u.test(rawInput))
        return { ok: false, code: 'empty', message: 'Slash input is empty' };
    if (rawInput[0] !== '/')
        return { ok: false, code: 'not_slash', message: 'Slash input must start with /' };
    if (rawInput.length === 1)
        return { ok: false, code: 'only_slash', message: 'Slash input has no command name' };
    let commandEnd = 1;
    while (commandEnd < rawInput.length) {
        const character = rawInput[commandEnd];
        if (character === undefined || /\s/u.test(character))
            break;
        commandEnd += 1;
    }
    if (commandEnd === 1)
        return { ok: false, code: 'only_slash', message: 'Slash input has no command name' };
    const commandName = rawInput.slice(1, commandEnd);
    const argsRaw = rawInput.slice(commandEnd);
    const parsedTokens = parseTokens(argsRaw, commandEnd);
    if (isSlashParseError(parsedTokens))
        return parsedTokens;
    return { ok: true, rawInput, commandName, argsRaw, tokens: parsedTokens.tokens };
}
export function toForwardPayload(rawInput) {
    const parsed = parseSlashInput(rawInput);
    if (!parsed.ok)
        return parsed;
    return Object.freeze({ ...parsed, forwardRaw: rawInput, executed: false });
}
function serializeToken(token) {
    if (token.length > 0 && /^[^\s'"\\]+$/u.test(token))
        return token;
    return `'${token.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}
export function serializeSlashPayload(payload) {
    if (payload.tokens.length === 0)
        return `/${payload.commandName}`;
    return `/${payload.commandName} ${payload.tokens.map(serializeToken).join(' ')}`;
}
//# sourceMappingURL=commands.js.map