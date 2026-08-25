# dsh-engine-suite architecture

## Goal

`@wolffycode/dsh-engine-suite` is one installable DeepSeek Harness plugin. It owns the
multi-engine catalog and runtime boundary while keeping engine-specific execution behind a
Driver interface.

The first driver is `codex-cli`. Claude CLI and the native Harness/DeepSeek driver are future
implementations of the same contract.

## Product model

The user-facing catalog has three layers:

```text
Engine → Provider → Model → Reasoning effort
```

The runtime has one additional internal layer:

```text
EngineProfile = validated Engine + Provider + Model + runtime policy snapshot
```

A Session captures the resolved profile and revision at creation time. Editing settings later does
not change an existing Session.

## Package boundary

The repository is one installable package. Internal modules have one owner and are loaded/unloaded
by the root plugin; they are not separate user-installed plugins.

```text
src/
├── engine/       Engine definitions and capabilities
├── provider/     Provider records and endpoint validation
├── model/        Model catalog and reasoning metadata
├── profile/      Selection validation and immutable snapshots
├── credential/   Credential references; never raw secrets in domain records
├── runtime/      Future process and Session binding boundary
├── codex/        Future Codex app-server driver
├── agent/        Future Agent factory and parent/child routing
├── settings/     Future Host/Client settings contribution
└── conversation/ Future cascading selector contribution
```

## Codex v1 boundary

The Codex driver will use a local `codex app-server` process. Harness Session is the durable
source of truth; Codex Thread and process identifiers are external bindings.

Codex-owned tool activity is not converted into Harness `tool/call` / `tool/result`, because those
events mean that the Harness Agent requested a Harness tool. Engine activity will use a separate
normalized event family for UI, telemetry, and replay-safe display.

## Provider policy

The first provider contract supports API-key authentication and the Responses wire protocol. The
provider stores a credential reference, not the key. Local debugging reads credentials only from
environment variables:

- `DSH_DEBUG_CODEX_BASE_URI`
- `DSH_DEBUG_CODEX_API_KEY`

A real key must never be committed, logged, or placed in a Session.

## Model policy

Model discovery is capability-driven. A provider may return model IDs and model-specific reasoning
options; discovery failure must eventually support manual model registration. Context window data
is metadata, not proof of service-side support. The UI may expose a 1M toggle, while the domain
stores a numeric `contextWindowTokens` and its source.

## Parent/child policy

Every Agent owns one EngineProfile snapshot. A child may use a different profile, but the parent
passes a profile ID, never a base URI, credential, or API key. A future parent/child router will
validate `allowedChildProfiles`, depth, concurrency, and caller identity before creating the child.

The first child milestone is foreground Codex → Codex. A future Codex-to-other-engine path will use
a Harness-controlled MCP bridge bound to the caller Agent; it will not accept a caller-supplied
parent identity.

## Implementation sequence

1. Domain catalog and profile validation (current foundation).
2. Codex app-server transport and process ownership.
3. Codex Agent Driver and Harness Session binding.
4. Settings and model discovery.
5. Conversation selector and immutable profile snapshot.
6. Foreground child Agent and profile policy.
7. Harness MCP bridge and background child lifecycle.
8. Claude CLI and native Harness drivers.
