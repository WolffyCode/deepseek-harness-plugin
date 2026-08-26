export interface EngineSuiteChildBridgeRequest {
    readonly parentSessionId: string;
    readonly profileId: string;
    readonly task: string;
    readonly nativeTaskId?: string;
}
export interface EngineSuiteChildBridgeResult {
    readonly childSessionId: string;
    readonly text: string;
}
export type EngineSuiteChildBridgeHandler = (request: EngineSuiteChildBridgeRequest) => Promise<EngineSuiteChildBridgeResult>;
export interface EngineSuiteChildBridgeLaunch {
    readonly serverUrl: string;
    readonly token: string;
    readonly environment: Readonly<Record<string, string>>;
    readonly mcpServer: {
        readonly id: string;
        readonly name: string;
        readonly transport: 'stdio';
        readonly command: string;
        readonly args: readonly string[];
    };
}
/** Local-only HTTP control plane used by CLI-native MCP child delegation. */
export declare class EngineSuiteChildBridge {
    private readonly handler;
    private readonly token;
    private readonly server;
    private address;
    private started;
    constructor(handler: EngineSuiteChildBridgeHandler);
    start(): Promise<void>;
    close(): Promise<void>;
    launchFor(parentSessionId: string): EngineSuiteChildBridgeLaunch;
    private handle;
}
//# sourceMappingURL=bridge.d.ts.map