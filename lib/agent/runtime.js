function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
function stringValue(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
function fieldString(value, key) {
    return stringValue(value[key]);
}
function fieldBoolean(value, key) {
    return typeof value[key] === "boolean" ? value[key] : undefined;
}
function turnIdFrom(value) {
    return fieldString(value, "turnId") ?? fieldString(value, "turn_id");
}
function withTurn(event, turnId) {
    return turnId === undefined ? event : { ...event, turnId };
}
function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function nonNegativeIndex(value) {
    const number = finiteNumber(value);
    return number !== undefined && Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}
const providerProtocolKeys = new Set(["method", "itemType", "tokenUsage", "errorDetails", "codexErrorInfo"]);
function sanitizeMetadataValue(value, depth = 0) {
    if (depth > 8 || value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map(item => sanitizeMetadataValue(item, depth + 1));
    const input = value;
    const output = {};
    for (const [key, nested] of Object.entries(input)) {
        if (providerProtocolKeys.has(key))
            continue;
        output[key] = sanitizeMetadataValue(nested, depth + 1);
    }
    return output;
}
function metadataFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const sanitized = sanitizeMetadataValue(input);
    const output = record(sanitized);
    return output === undefined || Object.keys(output).length === 0 ? undefined : output;
}
function usageCounterFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const counter = {};
    const number = (...keys) => {
        for (const key of keys) {
            const valueForKey = finiteNumber(input[key]);
            if (valueForKey !== undefined)
                return valueForKey;
        }
        return undefined;
    };
    const values = [
        ["inputTokens", number("inputTokens", "input_tokens")],
        ["cachedInputTokens", number("cachedInputTokens", "cached_input_tokens")],
        ["outputTokens", number("outputTokens", "output_tokens")],
        ["reasoningTokens", number("reasoningTokens", "reasoning_tokens")],
        ["totalTokens", number("totalTokens", "total_tokens")],
    ];
    for (const [key, valueForKey] of values)
        if (valueForKey !== undefined)
            counter[key] = valueForKey;
    return Object.keys(counter).length === 0 ? undefined : counter;
}
function usageBreakdownFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const total = usageCounterFrom(input["total"]);
    const turn = usageCounterFrom(input["turn"] ?? input["last"]);
    return total === undefined && turn === undefined ? undefined : {
        ...(total === undefined ? {} : { total }),
        ...(turn === undefined ? {} : { turn }),
    };
}
function usageFrom(value, breakdownValue) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const nestedTotal = usageCounterFrom(input["total"]);
    const nestedTurn = usageCounterFrom(input["turn"] ?? input["last"]);
    const source = nestedTotal !== undefined
        ? nestedTotal
        : nestedTurn !== undefined
            ? nestedTurn
            : input;
    const usage = {};
    const numeric = (...keys) => {
        for (const key of keys) {
            const valueForKey = finiteNumber(source[key]);
            if (valueForKey !== undefined)
                return valueForKey;
        }
        return undefined;
    };
    const values = [
        ["inputTokens", numeric("inputTokens", "input_tokens")],
        ["cachedInputTokens", numeric("cachedInputTokens", "cached_input_tokens")],
        ["outputTokens", numeric("outputTokens", "output_tokens")],
        ["totalCostUsd", numeric("totalCostUsd", "total_cost_usd")],
        ["contextWindowMaxTokens", numeric("contextWindowMaxTokens", "context_window_max_tokens", "modelContextWindow") ?? finiteNumber(input["modelContextWindow"])],
        ["contextWindowUsedTokens", numeric("contextWindowUsedTokens", "context_window_used_tokens")],
    ];
    for (const [key, valueForKey] of values)
        if (valueForKey !== undefined)
            usage[key] = valueForKey;
    const breakdown = usageBreakdownFrom(breakdownValue) ?? usageBreakdownFrom(value);
    if (breakdown !== undefined)
        usage.breakdown = breakdown;
    return Object.keys(usage).length === 0 ? undefined : usage;
}
function structuredErrorFrom(value, fallbackMessage, code, diagnostic) {
    const input = record(value);
    const message = typeof value === "string" ? stringValue(value) : fieldString(input ?? {}, "message") ?? fallbackMessage;
    if (message === undefined)
        return undefined;
    const nested = record(input?.["codexErrorInfo"]);
    const resolvedCode = code ?? fieldString(input ?? {}, "code") ?? fieldString(nested ?? {}, "code");
    const resolvedDiagnostic = diagnostic
        ?? fieldString(input ?? {}, "diagnostic")
        ?? fieldString(input ?? {}, "additionalDetails");
    const details = {};
    for (const key of ["category", "retryable", "status", "requestId", "cause"]) {
        if (input !== undefined && Object.prototype.hasOwnProperty.call(input, key))
            details[key] = input[key];
    }
    return {
        message,
        ...(resolvedCode === undefined ? {} : { code: resolvedCode }),
        ...(resolvedDiagnostic === undefined ? {} : { diagnostic: resolvedDiagnostic }),
        ...(Object.keys(details).length === 0 ? {} : { details: details }),
    };
}
function pathsFrom(value) {
    if (!Array.isArray(value))
        return undefined;
    const paths = value.map(entry => fieldString(record(entry) ?? {}, "path")).filter((path) => path !== undefined);
    return paths.length === 0 ? undefined : [...new Set(paths)];
}
function toolMetadataFrom(value) {
    const item = record(value["item"]);
    const kind = fieldString(value, "itemType") ?? fieldString(item ?? {}, "type");
    const source = item ?? value;
    if (kind === "commandExecution") {
        const command = fieldString(source, "command");
        const cwd = fieldString(source, "cwd");
        return { tool: { kind: "command", ...(command === undefined ? {} : { command }), ...(cwd === undefined ? {} : { cwd }) } };
    }
    if (kind === "fileChange") {
        const changes = source["changes"] ?? source["patch"] ?? value["changes"] ?? value["patch"];
        const patch = source["patch"] ?? value["patch"];
        const paths = pathsFrom(changes);
        return { file: { ...(paths === undefined ? {} : { paths }), ...(changes === undefined ? {} : { changes }), ...(patch === undefined ? {} : { patch }) } };
    }
    if (kind === "mcpToolCall") {
        const server = fieldString(source, "server");
        const tool = fieldString(source, "tool") ?? fieldString(source, "name") ?? fieldString(value, "name");
        return { mcp: { ...(server === undefined ? {} : { server }), ...(tool === undefined ? {} : { tool }) } };
    }
    if (kind === "dynamicToolCall") {
        const name = fieldString(source, "name") ?? fieldString(source, "tool") ?? fieldString(value, "name");
        return { tool: { kind: "dynamic", ...(name === undefined ? {} : { name }) } };
    }
    if (kind === "webSearch")
        return { tool: { kind: "web", name: "web_search" } };
    if (kind === "computerCall" || kind === "computer_call")
        return { tool: { kind: "computer", name: "computer" } };
    return undefined;
}
function reasoningMetadataFrom(value) {
    const stream = fieldString(value, "stream");
    const contentIndex = nonNegativeIndex(value["contentIndex"]);
    const summaryIndex = nonNegativeIndex(value["summaryIndex"]);
    if (stream !== "text" && stream !== "summary" && contentIndex === undefined && summaryIndex === undefined)
        return undefined;
    return {
        reasoning: {
            ...(stream === "text" || stream === "summary" ? { stream } : {}),
            ...(contentIndex === undefined ? {} : { contentIndex }),
            ...(summaryIndex === undefined ? {} : { summaryIndex }),
        },
    };
}
function modeFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const id = fieldString(input, "id");
    const label = fieldString(input, "label");
    if (id === undefined || label === undefined)
        return undefined;
    const description = fieldString(input, "description");
    return description === undefined ? { id, label } : { id, label, description };
}
function modelFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const id = fieldString(input, "id");
    if (id === undefined)
        return undefined;
    const label = fieldString(input, "label");
    const aliasesValue = input["aliases"];
    const aliases = Array.isArray(aliasesValue) ? aliasesValue.filter((item) => typeof item === "string") : undefined;
    return { id, ...(label === undefined ? {} : { label }), ...(aliases === undefined ? {} : { aliases }) };
}
function runtimeInfoFrom(value, provider) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const sessionValue = input["sessionId"];
    const sessionId = sessionValue === null ? null : stringValue(sessionValue);
    if (sessionValue !== null && sessionId === undefined)
        return undefined;
    const model = input["model"] === null ? null : stringValue(input["model"]);
    const modeId = input["modeId"] === null ? null : stringValue(input["modeId"]);
    const thinkingOptionId = input["thinkingOptionId"] === null ? null : stringValue(input["thinkingOptionId"]);
    return {
        provider,
        sessionId: sessionId ?? null,
        ...(model === undefined ? {} : { model }),
        ...(modeId === undefined ? {} : { modeId }),
        ...(thinkingOptionId === undefined ? {} : { thinkingOptionId }),
    };
}
function timelineItemFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const type = fieldString(input, "type");
    const metadata = metadataFrom(input["metadata"]);
    if (type === "user_message") {
        const text = fieldString(input, "text");
        if (text === undefined)
            return undefined;
        const messageId = fieldString(input, "messageId");
        const clientMessageId = fieldString(input, "clientMessageId");
        return { type, text, ...(messageId === undefined ? {} : { messageId }), ...(clientMessageId === undefined ? {} : { clientMessageId }), ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type === "assistant_message") {
        const text = fieldString(input, "text");
        if (text === undefined)
            return undefined;
        const messageId = fieldString(input, "messageId");
        const partial = fieldBoolean(input, "partial");
        return { type, text, ...(messageId === undefined ? {} : { messageId }), ...(partial === undefined ? {} : { partial }), ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type === "reasoning") {
        const text = fieldString(input, "text");
        const partial = fieldBoolean(input, "partial");
        return text === undefined ? undefined : { type, text, ...(partial === undefined ? {} : { partial }), ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type === "error") {
        const message = fieldString(input, "message");
        return message === undefined ? undefined : { type, message, ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type !== "tool_call")
        return undefined;
    const id = fieldString(input, "id");
    const name = fieldString(input, "name");
    const status = fieldString(input, "status");
    if (id === undefined || name === undefined || (status !== "running" && status !== "completed" && status !== "failed" && status !== "canceled"))
        return undefined;
    const error = fieldString(input, "error");
    const partial = fieldBoolean(input, "partial");
    return {
        type,
        id,
        name,
        status,
        ...(Object.prototype.hasOwnProperty.call(input, "input") ? { input: input["input"] } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "output") ? { output: input["output"] } : {}),
        ...(error === undefined ? {} : { error }),
        ...(partial === undefined ? {} : { partial }),
        ...(metadata === undefined ? {} : { metadata }),
    };
}
function identifierFrom(value) {
    if (typeof value === "string" && value.length > 0)
        return value;
    return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}
function serverRequestFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const rawMethod = fieldString(input, "method") ?? fieldString(input, "requestType");
    const directKind = fieldString(input, "kind");
    const kind = directKind === "command_approval" || rawMethod === "item/commandExecution/requestApproval" || rawMethod === "command_approval"
        ? "command_approval"
        : directKind === "file_approval" || rawMethod === "item/fileChange/requestApproval" || rawMethod === "file_approval"
            ? "file_approval"
            : directKind === "permission" || rawMethod === "item/permissions/requestApproval" || rawMethod === "permission"
                ? "permission"
                : directKind === "user_input" || rawMethod === "item/tool/requestUserInput" || rawMethod === "user_input"
                    ? "user_input"
                    : directKind === "elicitation" || rawMethod === "mcpServer/elicitation/request" || rawMethod === "elicitation"
                        ? "elicitation"
                        : undefined;
    if (kind === undefined)
        return undefined;
    const params = record(input["params"]) ?? record(input["input"]);
    const requestInput = {};
    for (const key of ["command", "cwd", "paths", "reason", "availableDecisions", "questions", "context"]) {
        if (params !== undefined && Object.prototype.hasOwnProperty.call(params, key))
            requestInput[key] = params[key];
    }
    const toolName = fieldString(input, "toolName") ?? fieldString(params ?? {}, "toolName") ?? fieldString(params ?? {}, "name");
    const id = identifierFrom(input["id"] ?? input["requestId"] ?? params?.["requestId"]);
    return {
        kind,
        ...(id === undefined ? {} : { id }),
        ...(toolName === undefined ? {} : { toolName }),
        ...(Object.keys(requestInput).length === 0 ? {} : { input: requestInput }),
    };
}
function permissionRequestFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const id = fieldString(input, "id");
    const name = fieldString(input, "name");
    const kind = fieldString(input, "kind");
    if (id === undefined || name === undefined || (kind !== "tool" && kind !== "plan" && kind !== "question" && kind !== "mode" && kind !== "other"))
        return undefined;
    const title = fieldString(input, "title");
    const description = fieldString(input, "description");
    const nestedInput = record(input["input"]);
    return {
        id,
        name,
        kind,
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
        ...(nestedInput === undefined ? {} : { input: nestedInput }),
    };
}
function permissionResponseFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const behavior = fieldString(input, "behavior");
    const selectedActionId = fieldString(input, "selectedActionId");
    if (behavior === "allow") {
        const updatedInput = record(input["updatedInput"]);
        return { behavior, ...(selectedActionId === undefined ? {} : { selectedActionId }), ...(updatedInput === undefined ? {} : { updatedInput: updatedInput }) };
    }
    if (behavior === "deny") {
        const message = fieldString(input, "message");
        const interrupt = fieldBoolean(input, "interrupt");
        return { behavior, ...(selectedActionId === undefined ? {} : { selectedActionId }), ...(message === undefined ? {} : { message }), ...(interrupt === undefined ? {} : { interrupt }) };
    }
    return undefined;
}
function providerSubagentFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const subagentId = fieldString(input, "subagentId");
    const status = fieldString(input, "status");
    if (subagentId === undefined || (status !== "started" && status !== "updated" && status !== "completed" && status !== "failed" && status !== "canceled"))
        return undefined;
    const text = fieldString(input, "text");
    const item = timelineItemFrom(input["item"]);
    return { subagentId, status, ...(text === undefined ? {} : { text }), ...(item === undefined ? {} : { item }) };
}
function mergeMetadata(...values) {
    const merged = Object.assign({}, ...values.filter((value) => value !== undefined));
    return Object.keys(merged).length === 0 ? undefined : merged;
}
function errorMessageFrom(value, fallback) {
    return stringValue(value) ?? fieldString(record(value) ?? {}, "message") ?? fallback;
}
function errorMetadataFrom(value, fallbackMessage, code, diagnostic) {
    const error = structuredErrorFrom(value, fallbackMessage, code, diagnostic);
    return error === undefined ? undefined : { error };
}
/** Converts opaque external notifications and canonical events to AgentStreamEvent. */
export function normalizeExternalEngineEvent(value, provider, fallbackTurnId) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const type = fieldString(input, "type");
    if (type === undefined)
        return undefined;
    const turnId = turnIdFrom(input) ?? fallbackTurnId;
    if (type === "text-delta") {
        const text = fieldString(input, "text");
        if (text === undefined)
            return undefined;
        const event = { type: "timeline", provider, item: { type: "assistant_message", text, partial: true } };
        return withTurn(event, turnId);
    }
    if (type === "tool-call") {
        const id = fieldString(input, "id");
        const name = fieldString(input, "name");
        if (id === undefined || name === undefined)
            return undefined;
        const metadata = mergeMetadata(toolMetadataFrom(input), metadataFrom(input["metadata"]));
        const item = {
            type: "tool_call",
            id,
            name,
            status: "running",
            ...(input["arguments"] === undefined ? {} : { input: input["arguments"] }),
            ...(metadata === undefined ? {} : { metadata }),
        };
        return withTurn({ type: "timeline", provider, item }, turnId);
    }
    if (type === "tool-result") {
        const id = fieldString(input, "id");
        if (id === undefined)
            return undefined;
        const output = input["output"];
        const failed = fieldBoolean(input, "isError") ?? false;
        const error = failed ? errorMessageFrom(output, "external tool failed") : undefined;
        const toolErrorMetadata = failed || input["errorDetails"] !== undefined || input["error"] !== undefined
            ? errorMetadataFrom(input["errorDetails"] ?? input["error"] ?? output, error ?? "external tool failed")
            : undefined;
        const metadata = mergeMetadata(toolMetadataFrom(input), toolErrorMetadata, metadataFrom(input["metadata"]));
        const item = {
            type: "tool_call",
            id,
            name: fieldString(input, "name") ?? "external_tool",
            status: failed ? "failed" : "completed",
            ...(output === undefined ? {} : { output }),
            ...(error === undefined ? {} : { error }),
            ...(metadata === undefined ? {} : { metadata }),
        };
        return withTurn({ type: "timeline", provider, item }, turnId);
    }
    if (type === "turn-completed") {
        const status = fieldString(input, "status");
        const turn = record(input["turn"]);
        const usageValue = input["usage"] ?? input["tokenUsage"] ?? turn?.["usage"] ?? turn?.["tokenUsage"];
        const usage = usageFrom(usageValue, input["tokenUsage"] ?? turn?.["usage"] ?? turn?.["tokenUsage"]);
        const failureMessage = errorMessageFrom(input["error"], "external engine turn failed");
        const failureMetadata = errorMetadataFrom(input["errorDetails"] ?? input["error"], failureMessage);
        const result = fieldString(input, "result");
        const event = status === "completed"
            ? { type: "turn_completed", provider, ...(usage === undefined ? {} : { usage }), ...(result === undefined ? {} : { result }) }
            : { type: "turn_failed", provider, error: failureMessage, ...(failureMetadata === undefined ? {} : { metadata: failureMetadata }) };
        return withTurn(event, turnId);
    }
    if (type === "thread_started") {
        const sessionId = fieldString(input, "sessionId");
        const metadata = metadataFrom(input["metadata"]);
        return sessionId === undefined ? undefined : { type: "thread_started", provider, sessionId, ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type === "turn_started") {
        const metadata = metadataFrom(input["metadata"]);
        return withTurn({ type: "turn_started", provider, ...(metadata === undefined ? {} : { metadata }) }, turnId);
    }
    if (type === "turn_completed") {
        const turn = record(input["turn"]);
        const usageValue = input["usage"] ?? input["tokenUsage"] ?? turn?.["usage"] ?? turn?.["tokenUsage"];
        const usage = usageFrom(usageValue, input["tokenUsage"] ?? turn?.["usage"] ?? turn?.["tokenUsage"]);
        const metadata = metadataFrom(input["metadata"]);
        const result = fieldString(input, "result");
        const event = {
            type: "turn_completed",
            provider,
            ...(usage === undefined ? {} : { usage }),
            ...(result === undefined ? {} : { result }),
            ...(metadata === undefined ? {} : { metadata }),
        };
        return withTurn(event, turnId);
    }
    if (type === "turn_failed") {
        const errorValue = input["error"];
        const error = errorValue === undefined ? undefined : errorMessageFrom(errorValue, "external engine turn failed");
        if (error === undefined)
            return undefined;
        const code = fieldString(input, "code");
        const diagnostic = fieldString(input, "diagnostic");
        const metadata = mergeMetadata(errorMetadataFrom(input["errorDetails"] ?? input["structuredError"] ?? input["error"], error, code, diagnostic), metadataFrom(input["metadata"]));
        const event = { type: "turn_failed", provider, error, ...(code === undefined ? {} : { code }), ...(diagnostic === undefined ? {} : { diagnostic }), ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    if (type === "turn_canceled") {
        const reason = fieldString(input, "reason");
        if (reason === undefined)
            return undefined;
        const metadata = metadataFrom(input["metadata"]);
        const event = { type: "turn_canceled", provider, reason, ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    if (type === "timeline") {
        const item = timelineItemFrom(input["item"]);
        if (item === undefined)
            return undefined;
        const timestamp = fieldString(input, "timestamp");
        const metadata = metadataFrom(input["metadata"]);
        const event = { type: "timeline", provider, item, ...(timestamp === undefined ? {} : { timestamp }), ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    if (type === "reasoning") {
        const text = fieldString(input, "text");
        if (text === undefined)
            return undefined;
        const metadata = mergeMetadata(reasoningMetadataFrom(input), metadataFrom(input["metadata"]));
        const event = { type: "reasoning", provider, text, ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    if (type === "usage_updated") {
        const usage = usageFrom(input["usage"] ?? input["tokenUsage"], input["tokenUsage"]);
        if (usage === undefined)
            return undefined;
        const metadata = metadataFrom(input["metadata"]);
        const event = { type: "usage_updated", provider, usage, ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    if (type === "status_changed" || type === "status" || type === "working") {
        const status = fieldString(input, "status") ?? fieldString(input, "value") ?? (type === "working" ? "working" : undefined);
        if (status === undefined)
            return undefined;
        const metadata = metadataFrom(input["metadata"]);
        const event = { type: "status_changed", provider, status, ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    if (type === "permission_requested") {
        const request = permissionRequestFrom(input["request"]);
        if (request === undefined)
            return undefined;
        const metadata = metadataFrom(input["metadata"]);
        const event = { type: "permission_requested", provider, request, ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    if (type === "permission_resolved") {
        const requestId = fieldString(input, "requestId");
        const resolution = permissionResponseFrom(input["resolution"]);
        if (requestId === undefined || resolution === undefined)
            return undefined;
        const metadata = metadataFrom(input["metadata"]);
        const event = { type: "permission_resolved", provider, requestId, resolution, ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    if (type === "mode_changed") {
        const currentModeId = input["currentModeId"] === null ? null : fieldString(input, "currentModeId") ?? null;
        const availableModes = Array.isArray(input["availableModes"])
            ? input["availableModes"].map(modeFrom).filter((mode) => mode !== undefined)
            : [];
        const metadata = metadataFrom(input["metadata"]);
        return { type: "mode_changed", provider, currentModeId, availableModes, ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type === "model_changed") {
        const runtimeInfo = runtimeInfoFrom(input["runtimeInfo"], provider);
        const metadata = metadataFrom(input["metadata"]);
        return runtimeInfo === undefined ? undefined : { type: "model_changed", provider, runtimeInfo, ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type === "thinking_option_changed") {
        const thinkingOptionId = input["thinkingOptionId"] === null ? null : fieldString(input, "thinkingOptionId") ?? null;
        const metadata = metadataFrom(input["metadata"]);
        return { type: "thinking_option_changed", provider, thinkingOptionId, ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type === "attention_required") {
        const reason = fieldString(input, "reason");
        const timestamp = fieldString(input, "timestamp");
        if ((reason !== "finished" && reason !== "error" && reason !== "permission") || timestamp === undefined)
            return undefined;
        const metadata = metadataFrom(input["metadata"]);
        return { type: "attention_required", provider, reason, timestamp, ...(metadata === undefined ? {} : { metadata }) };
    }
    if (type === "provider_subagent") {
        const event = providerSubagentFrom(input["event"]);
        if (event === undefined)
            return undefined;
        const metadata = metadataFrom(input["metadata"]);
        const canonical = { type: "provider_subagent", provider, event, ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(canonical, turnId);
    }
    if (type === "server_request" || type === "server-request") {
        const request = serverRequestFrom(input["request"] ?? input);
        if (request === undefined)
            return undefined;
        const event = { type: "server_request", provider, request };
        return withTurn(event, turnId);
    }
    if (type === "error") {
        const errorValue = input["error"];
        const error = errorValue === undefined ? undefined : errorMessageFrom(errorValue, "external engine error");
        if (error === undefined)
            return undefined;
        const code = fieldString(input, "code");
        const metadata = mergeMetadata(errorMetadataFrom(input["errorDetails"] ?? input["structuredError"] ?? input["error"], error, code), metadataFrom(input["metadata"]));
        const event = { type: "error", provider, error, ...(code === undefined ? {} : { code }), ...(metadata === undefined ? {} : { metadata }) };
        return withTurn(event, turnId);
    }
    return undefined;
}
/** Adapts the native Claude session to the Harness external-engine runtime contract. */
function toUsage(value) {
    const usage = {};
    if (typeof value.inputTokens === "number")
        usage.inputTokens = value.inputTokens;
    if (typeof value.cachedInputTokens === "number")
        usage.cachedInputTokens = value.cachedInputTokens;
    if (typeof value.outputTokens === "number")
        usage.outputTokens = value.outputTokens;
    if (typeof value.totalCostUsd === "number")
        usage.totalCostUsd = value.totalCostUsd;
    if (typeof value.contextWindowMaxTokens === "number")
        usage.contextWindowMaxTokens = value.contextWindowMaxTokens;
    if (typeof value.contextWindowUsedTokens === "number")
        usage.contextWindowUsedTokens = value.contextWindowUsedTokens;
    return usage;
}
function toPermission(request) {
    return {
        id: request.requestId,
        kind: "tool",
        name: request.toolName,
        input: request.input,
        ...(request.title === undefined ? {} : { title: request.title }),
        ...(request.description === undefined ? {} : { description: request.description }),
    };
}
export class ClaudeSessionRuntimeBridge {
    session;
    processExited;
    resolveProcessExited;
    process;
    partialAssistantTurns = new Set();
    partialReasoningTurns = new Set();
    terminalTurns = new Set();
    suppressUnscopedEvents = false;
    listeners = new Set();
    unsubscribe;
    activeTurnId;
    interruptTurnId;
    interruptPromise;
    interruptPendingBeforeTurn = false;
    turnStartPending = false;
    closed = false;
    constructor(session) {
        this.session = session;
        let resolveProcessExited;
        this.processExited = new Promise(resolve => { resolveProcessExited = resolve; });
        this.resolveProcessExited = resolveProcessExited;
        this.process = { exited: this.processExited, stderrTail: "" };
        this.unsubscribe = session.subscribe(event => {
            const eventTurnId = "turnId" in event ? event.turnId : undefined;
            if (event.type === "turn_started") {
                if (this.terminalTurns.has(event.turnId))
                    return;
                this.activeTurnId = event.turnId;
                this.suppressUnscopedEvents = false;
                const interruptBeforeTurn = this.interruptPendingBeforeTurn;
                if (interruptBeforeTurn) {
                    this.interruptPendingBeforeTurn = false;
                    this.interruptTurnId = event.turnId;
                    this.interruptPromise = this.session.interrupt();
                    void this.interruptPromise.catch(() => { });
                }
                else {
                    this.interruptTurnId = undefined;
                    this.interruptPromise = undefined;
                }
            }
            else if (eventTurnId !== undefined && this.terminalTurns.has(eventTurnId)) {
                return;
            }
            else if (eventTurnId === undefined && this.suppressUnscopedEvents && event.type !== "process_exited") {
                return;
            }
            if (event.type === "process_exited")
                this.resolveProcessExited();
            const projected = this.project(event);
            if (projected !== undefined) {
                if (event.type === "turn_completed" || event.type === "turn_failed" || event.type === "turn_canceled") {
                    const terminalTurnId = event.turnId ?? this.activeTurnId;
                    if (terminalTurnId !== undefined)
                        this.terminalTurns.add(terminalTurnId);
                    if (event.turnId === undefined)
                        this.suppressUnscopedEvents = true;
                }
                for (const listener of [...this.listeners])
                    listener(projected);
            }
            if (event.type === "turn_completed" || event.type === "turn_failed" || event.type === "turn_canceled") {
                if (event.turnId === undefined || event.turnId === this.activeTurnId) {
                    this.activeTurnId = undefined;
                }
            }
        });
    }
    get turnId() { return this.activeTurnId; }
    whenReady() { return this.session.whenReady?.() ?? Promise.resolve(); }
    onEvent(handler) {
        this.listeners.add(handler);
        return () => this.listeners.delete(handler);
    }
    async startTurn(text, _signal) {
        this.interruptPendingBeforeTurn = false;
        this.turnStartPending = true;
        try {
            const result = await this.session.startTurn(text).catch(error => {
                this.interruptPendingBeforeTurn = false;
                throw error;
            });
            this.activeTurnId = this.terminalTurns.has(result.turnId) ? undefined : result.turnId;
            if (!this.interruptPendingBeforeTurn) {
                this.interruptTurnId = undefined;
                this.interruptPromise = undefined;
            }
            return { id: result.turnId };
        }
        finally {
            this.turnStartPending = false;
        }
    }
    async interrupt(_signal) {
        if (this.closed)
            return;
        if (this.activeTurnId === undefined && this.turnStartPending) {
            this.interruptPendingBeforeTurn = true;
            return;
        }
        if (this.activeTurnId === undefined)
            return;
        if (this.interruptTurnId === this.activeTurnId && this.interruptPromise !== undefined) {
            await this.interruptPromise;
            return;
        }
        const turnId = this.activeTurnId;
        this.interruptTurnId = turnId;
        this.interruptPromise = this.session.interrupt();
        await this.interruptPromise;
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.unsubscribe();
        this.activeTurnId = undefined;
        this.interruptTurnId = undefined;
        this.interruptPromise = undefined;
        this.interruptPendingBeforeTurn = false;
        this.partialAssistantTurns.clear();
        this.partialReasoningTurns.clear();
        await this.session.close();
        this.resolveProcessExited();
    }
    project(event) {
        const provider = "claude-cli";
        switch (event.type) {
            case "session_started": return { type: "thread_started", provider, sessionId: event.sessionId };
            case "turn_started": return { type: "turn_started", provider, turnId: event.turnId };
            case "timeline": {
                if (event.item.type === "assistant_message" && event.item.partial === true && event.turnId !== undefined) {
                    this.partialAssistantTurns.add(event.turnId);
                }
                if (event.item.type === "assistant_message" && event.item.partial !== true && event.turnId !== undefined && this.partialAssistantTurns.has(event.turnId)) {
                    return undefined;
                }
                if (event.item.type === "reasoning" && event.item.partial === true && event.turnId !== undefined) {
                    this.partialReasoningTurns.add(event.turnId);
                }
                if (event.item.type === "reasoning" && event.item.partial !== true && event.turnId !== undefined && this.partialReasoningTurns.has(event.turnId)) {
                    return undefined;
                }
                const item = this.timeline(event.item);
                return { type: "timeline", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), item };
            }
            case "usage_updated": return { type: "usage_updated", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), usage: toUsage(event.usage) };
            case "permission_requested": return { type: "permission_requested", provider, request: toPermission(event.request) };
            case "status_changed": {
                const metadata = metadataFrom(event.metadata);
                return { type: "status_changed", provider, status: event.status, ...(metadata === undefined ? {} : { metadata }) };
            }
            case "turn_completed": {
                if (event.turnId !== undefined)
                    this.partialAssistantTurns.delete(event.turnId);
                if (event.turnId !== undefined)
                    this.partialReasoningTurns.delete(event.turnId);
                return {
                    type: "turn_completed",
                    provider,
                    ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
                    ...(event.usage === undefined ? {} : { usage: toUsage(event.usage) }),
                    ...(event.result === undefined ? {} : { result: event.result }),
                };
            }
            case "turn_failed": {
                if (event.turnId !== undefined)
                    this.partialAssistantTurns.delete(event.turnId);
                if (event.turnId !== undefined)
                    this.partialReasoningTurns.delete(event.turnId);
                const metadata = { error: { message: event.error } };
                return { type: "turn_failed", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), error: event.error, metadata };
            }
            case "turn_canceled": {
                if (event.turnId !== undefined)
                    this.partialAssistantTurns.delete(event.turnId);
                if (event.turnId !== undefined)
                    this.partialReasoningTurns.delete(event.turnId);
                return { type: "turn_canceled", provider, ...(event.turnId === undefined ? {} : { turnId: event.turnId }), reason: "canceled" };
            }
            default: return undefined;
        }
    }
    timeline(item) {
        const value = item;
        const metadata = metadataFrom(value.metadata);
        if (value.type === "tool_call" || value.type === "tool_result") {
            let input = value.arguments;
            if (typeof value.arguments === "string") {
                try {
                    input = JSON.parse(value.arguments);
                }
                catch {
                    input = value.arguments;
                }
            }
            const toolMetadata = value.type === "tool_result" && value.isError === true
                ? { error: { message: typeof value.output === "string" ? value.output : "external tool failed" } }
                : undefined;
            const combined = mergeMetadata(metadata, toolMetadata);
            return { type: "tool_call", id: value.id ?? "", name: value.name ?? "external_tool", status: value.type === "tool_result" ? (value.isError ? "failed" : "completed") : "running", ...(input === undefined ? {} : { input }), ...(value.output === undefined ? {} : { output: value.output }), ...(value.partial === undefined ? {} : { partial: value.partial }), ...(combined === undefined ? {} : { metadata: combined }) };
        }
        if (value.type === "reasoning")
            return { type: "reasoning", text: value.text ?? "", ...(value.partial === undefined ? {} : { partial: value.partial }), ...(metadata === undefined ? {} : { metadata }) };
        if (value.type === "compaction")
            return { type: "compaction", status: "completed", ...(metadata === undefined ? {} : { metadata }) };
        if (value.type === "status")
            return { type: "error", message: value.text ?? "", ...(metadata === undefined ? {} : { metadata }) };
        return { type: "assistant_message", text: value.text ?? "", ...(value.partial === undefined ? {} : { partial: value.partial }), ...(metadata === undefined ? {} : { metadata }) };
    }
}
//# sourceMappingURL=runtime.js.map