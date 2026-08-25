import type { EngineId } from '../engine/types.js';
export type ProviderId = string;
export type CredentialRef = string;
export type ProviderStatus = 'unknown' | 'testing' | 'available' | 'rejected' | 'failed';
export type ProviderWireApi = 'responses';
export type ProviderAuthMode = 'api-key';
export interface EngineProvider {
    readonly id: ProviderId;
    readonly engineId: EngineId;
    readonly name: string;
    readonly baseUri: string;
    readonly credentialRef: CredentialRef;
    readonly wireApi: ProviderWireApi;
    readonly authMode: ProviderAuthMode;
    readonly enabled: boolean;
    readonly status: ProviderStatus;
    readonly lastTestedAt?: number;
    readonly lastError?: string;
}
export interface CreateProviderInput {
    readonly id: ProviderId;
    readonly engineId: EngineId;
    readonly name: string;
    readonly baseUri: string;
    readonly credentialRef: CredentialRef;
    readonly wireApi?: ProviderWireApi;
    readonly authMode?: ProviderAuthMode;
}
export declare function normalizeBaseUri(baseUri: string): string;
export declare function createProvider(input: CreateProviderInput): EngineProvider;
//# sourceMappingURL=types.d.ts.map