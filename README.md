# @wolffycode/dsh-engine-suite

A single-install DeepSeek Harness plugin for multi-engine Agent runtimes.

The first implementation target is Codex CLI. The package owns the engine/provider/model/profile
catalog and will later provide the Codex app-server Agent driver, settings surface, conversation
selector, and parent/child Agent routing.

## Current status

This repository currently contains the first domain foundation only:

- Engine definitions and capability declarations.
- Provider records with credential references instead of raw secrets.
- Model catalog records and model-specific reasoning options.
- Versioned EngineProfile resolution.
- A local-only Codex debug-provider seed reader.
- Codex app-server JSON-RPC transport, process lifecycle, and launch config materialization.
- A plugin-owned Codex Agent bridge that publishes CLI output into a Harness Session.

Harness/Cordis integration is deliberately not included yet. The next step is to bind this tested
Codex runtime to the Harness Agent/Session and plugin lifecycle contracts.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
```

Use `.env.example` for local configuration shape only. Never commit a real API key.
