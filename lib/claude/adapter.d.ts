import { ClaudeProviderSession } from './session.js';
import type { ClaudeAdapterOptions, ClaudeProviderClient } from './types.js';
export * from './types.js';
export { ClaudeProviderSession } from './session.js';
export { ClaudeSdkTransport } from './transport.js';
export type { ClaudeTransport, ClaudeTransportEvent } from './transport.js';
export declare function createClaudeProviderClient(): ClaudeProviderClient;
export declare function createClaudeProviderSession(options: ClaudeAdapterOptions): ClaudeProviderSession;
//# sourceMappingURL=adapter.d.ts.map