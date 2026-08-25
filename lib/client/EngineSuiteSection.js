import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
function useSettings(scope) {
    const [snapshot, setSnapshot] = useState(scope.getSnapshot());
    useEffect(() => {
        setSnapshot(scope.getSnapshot());
        return scope.subscribe(() => setSnapshot(scope.getSnapshot()));
    }, [scope]);
    return snapshot;
}
function upsertProvider(providers, input) {
    const existing = providers.findIndex(provider => provider.id === input.id);
    if (existing < 0)
        return [...providers, input];
    const next = [...providers];
    next[existing] = input;
    return next;
}
function upsertModel(models, input) {
    const existing = models.findIndex(model => model.id === input.id);
    if (existing < 0)
        return [...models, input];
    const next = [...models];
    next[existing] = input;
    return next;
}
export function EngineSuiteSection({ scope }) {
    const snapshot = useSettings(scope);
    const providers = snapshot.value?.providers ?? [];
    const models = snapshot.value?.models ?? [];
    const [providerId, setProviderId] = useState('debug-sub2api-codex');
    const [providerName, setProviderName] = useState('Debug Codex Relay');
    const [baseUri, setBaseUri] = useState('https://sub2api.opencodebay.com');
    const [credentialRef, setCredentialRef] = useState('debug-sub2api-codex');
    const [modelRecordId, setModelRecordId] = useState('debug-model');
    const [modelId, setModelId] = useState('');
    const [reasoningOptions, setReasoningOptions] = useState('low,medium,high');
    const [contextWindowTokens, setContextWindowTokens] = useState('');
    const [message, setMessage] = useState();
    const writable = snapshot.status === 'ready' && snapshot.writable;
    const saveProvider = async (event) => {
        event.preventDefault();
        const provider = {
            id: providerId.trim(),
            engineId: 'codex-cli',
            name: providerName.trim(),
            baseUri: baseUri.trim(),
            credentialRef: credentialRef.trim(),
            enabled: true,
        };
        try {
            await scope.set('providers', upsertProvider(providers, provider));
            setMessage(`Saved provider ${provider.id}`);
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        }
    };
    const saveModel = async (event) => {
        event.preventDefault();
        const options = reasoningOptions.split(',').map(value => value.trim()).filter(Boolean);
        const model = {
            id: modelRecordId.trim(),
            engineId: 'codex-cli',
            providerId: providerId.trim(),
            modelId: modelId.trim(),
            enabled: true,
            hidden: false,
            reasoningOptions: options,
            ...contextWindowTokens.trim() === '' ? {} : {
                contextWindowTokens: Number(contextWindowTokens),
                contextWindowSource: 'manual',
            },
            contextWindowSource: contextWindowTokens.trim() === '' ? 'unknown' : 'manual',
        };
        try {
            await scope.set('models', upsertModel(models, model));
            setMessage(`Saved model ${model.modelId}`);
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        }
    };
    return (_jsxs("section", { "aria-labelledby": "engine-suite-settings-title", children: [_jsx("h2", { id: "engine-suite-settings-title", children: "Engine Suite" }), _jsx("p", { children: "Configure Codex providers and the manual model catalog used by new Agents." }), _jsxs("p", { "data-status": snapshot.status, children: ["Settings status: ", snapshot.status] }), _jsxs("p", { children: ["Configured providers: ", providers.length] }), _jsxs("p", { children: ["Configured models: ", models.length] }), message === undefined ? null : _jsx("p", { role: "status", children: message }), _jsxs("form", { onSubmit: saveProvider, children: [_jsx("h3", { children: "Codex provider" }), _jsxs("label", { children: ["Provider ID", _jsx("input", { value: providerId, onChange: event => setProviderId(event.target.value), disabled: !writable })] }), _jsxs("label", { children: ["Name", _jsx("input", { value: providerName, onChange: event => setProviderName(event.target.value), disabled: !writable })] }), _jsxs("label", { children: ["Base URI", _jsx("input", { value: baseUri, onChange: event => setBaseUri(event.target.value), disabled: !writable })] }), _jsxs("label", { children: ["Credential reference", _jsx("input", { value: credentialRef, onChange: event => setCredentialRef(event.target.value), disabled: !writable })] }), _jsx("button", { type: "submit", disabled: !writable, children: "Save provider" })] }), _jsxs("form", { onSubmit: saveModel, children: [_jsx("h3", { children: "Manual model" }), _jsxs("label", { children: ["Model record ID", _jsx("input", { value: modelRecordId, onChange: event => setModelRecordId(event.target.value), disabled: !writable })] }), _jsxs("label", { children: ["Model ID", _jsx("input", { value: modelId, onChange: event => setModelId(event.target.value), disabled: !writable })] }), _jsxs("label", { children: ["Reasoning options (comma-separated)", _jsx("input", { value: reasoningOptions, onChange: event => setReasoningOptions(event.target.value), disabled: !writable })] }), _jsxs("label", { children: ["Context window tokens (optional; use 1000000 for 1M)", _jsx("input", { value: contextWindowTokens, onChange: event => setContextWindowTokens(event.target.value), disabled: !writable })] }), _jsx("button", { type: "submit", disabled: !writable || modelId.trim() === '', children: "Save model" })] })] }));
}
//# sourceMappingURL=EngineSuiteSection.js.map