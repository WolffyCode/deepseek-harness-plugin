import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { ClaudeProviderSession } from './session.js';
export * from './types.js';
export { ClaudeProviderSession } from './session.js';
export { ClaudeSdkTransport } from './transport.js';
export function createClaudeProviderClient() {
    return new ClaudeClient();
}
export function createClaudeProviderSession(options) {
    return new ClaudeProviderSession(options);
}
class ClaudeClient {
    engineId = 'claude-cli';
    createSession(options) {
        return new ClaudeProviderSession(options);
    }
    resumeSession(options) {
        return new ClaudeProviderSession(options);
    }
    async isAvailable() {
        const executable = process.env['CLAUDE_CODE_EXECUTABLE'] ?? 'claude';
        if (executable === 'claude')
            return true;
        try {
            await access(executable, constants.X_OK);
            return true;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=adapter.js.map