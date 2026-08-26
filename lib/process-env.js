/** Build child environments without forwarding debug credentials from the host shell. */
export function childEnvironment(overrides = {}) {
    const filtered = Object.entries(process.env).filter(([name]) => {
        if (name.startsWith('DSH_DEBUG_'))
            return false;
        return name !== 'OPENAI_API_KEY'
            && name !== 'ANTHROPIC_API_KEY'
            && name !== 'ANTHROPIC_AUTH_TOKEN';
    });
    return Object.fromEntries([
        ...filtered,
        ...Object.entries(overrides).filter(([, value]) => value !== undefined),
    ]);
}
//# sourceMappingURL=process-env.js.map