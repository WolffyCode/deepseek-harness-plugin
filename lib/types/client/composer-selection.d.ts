import type { EngineSuiteCatalogView, EngineSuiteEngineView, EngineSuiteModelView, EngineSuiteProviderView } from '../types.js';
export interface EngineSuiteComposerSelection {
    readonly engineId: string;
    readonly providerId: string;
    readonly modelRecordId: string;
    readonly reasoningEffort: string;
}
export declare function engineSelectionLocked(locked: boolean, sessionBlank: boolean | undefined): boolean;
export declare function enabledEngines(catalog: EngineSuiteCatalogView): readonly EngineSuiteEngineView[];
export declare function filterEngineOptions(engines: readonly EngineSuiteEngineView[], query: string): readonly EngineSuiteEngineView[];
export declare function filterProviderOptions(providers: readonly EngineSuiteProviderView[], query: string): readonly EngineSuiteProviderView[];
export declare function filterModelOptions(models: readonly EngineSuiteModelView[], query: string): readonly EngineSuiteModelView[];
export declare function enabledProviders(catalog: EngineSuiteCatalogView, engineId: string): readonly EngineSuiteProviderView[];
export declare function enabledModels(catalog: EngineSuiteCatalogView, providerId: string): readonly EngineSuiteModelView[];
export declare function defaultReasoningEffort(model: EngineSuiteModelView | undefined): string;
export declare function resolveEngineSelection(catalog: EngineSuiteCatalogView, engineId: string): EngineSuiteComposerSelection;
export declare function resolveProviderSelection(catalog: EngineSuiteCatalogView, engineId: string, providerId: string): EngineSuiteComposerSelection;
export declare function resolveModelSelection(models: readonly EngineSuiteModelView[], modelRecordId: string): Pick<EngineSuiteComposerSelection, 'modelRecordId' | 'reasoningEffort'>;
//# sourceMappingURL=composer-selection.d.ts.map