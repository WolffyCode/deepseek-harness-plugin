# Engine Suite 统一本地 Agent 架构

## 发布范围

`@wolffycode/dsh-engine-suite` 是一个安装包，提供统一 Harness Session/Workspace 入口和两个外部引擎：

- `claude-cli`：只服务 GLM 模型，使用 Claude SDK `stream-json`；
- `codex-cli`：使用 Codex app-server 和 stdio JSON-RPC。

DeepSeek Native Agent 仍由宿主 Harness 提供，不是本插件的外部引擎。Claude Opus 在 catalog、selection、session construction、model switch 和真实 E2E 入口全部禁止。

## 分层

```text
Harness Conversation / Workspace / Session / Approval
                         │
               Engine Suite Remote + UI
                         │
             Engine / Provider / Model / Reasoning
                         │
                   EngineProfile snapshot
                         │
                 ExternalEngineAgent
                         │
                 ExternalEngineRuntime
                    ┌────┴────┐
              Claude GLM   Codex
```

Harness 负责 Session 持久事件、Workspace、权限、Agent 生命周期和 Native Agent。插件负责 catalog、profile policy、外部进程、native session/thread binding、协议事件投影、用户 Skill/MCP 资产和 child Agent bridge；插件不复制 Harness 历史或 Workspace。

## 通用运行时

`src/agent/runtime.ts` 和 `src/agent/external-engine-agent.ts` 提供引擎无关的事件桥：外部 CLI 事件先归一化，再投影为 Harness Session 事件。Claude 具体实现位于 `src/claude/`；Codex 具体实现位于 `src/codex/`。不存在旧的 Claude `launch.ts` 或 `runtime.ts` 模块。

统一事件包括文本增量、tool call、tool result、turn completion、reasoning、usage 和失败/取消。外部 CLI 负责原生规划和工具执行，插件不把 Harness tool schema 或 System Prompt 自动发送给 CLI。

## Claude/GLM

Claude 通过 SDK query 使用 `claude -p` 的 stream-json 能力。启动参数由 `src/claude/session.ts` 和 `src/claude/transport.ts` 组织，包含 bare、stream input/output、partial message、model 和 effort；权限由 `src/claude/control.ts` 转到 Harness Approval。

Provider 只以 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN` 和内存 credential 组成当前进程环境。Harness prompt、tool schema、Harness/cross-engine agent map 不进入 Claude SDK options。用户显式 Claude agent 定义必须通过 opt-in wrapper。

当前 Claude model policy 是 GLM-only + Opus deny。SDK catalog 中任何 Opus 字段都会被过滤；selection、会话构造、模型切换和真实 E2E 也会再次拒绝。

## Codex

Codex 运行在隔离 `CODEX_HOME`：

```text
Harness Session
  → Codex Thread ID
  → isolated CODEX_HOME/config.toml
  → codex app-server --listen stdio://
```

`OPENAI_API_KEY` 只通过进程环境传递，配置文件不保存 key。Runtime 归一化 agent message delta、command execution、file change、MCP item、tool result 和 turn completion。

## Profile、Session 与 child Agent

Composer 顺序固定为 `Engine → Provider → Model → Reasoning`。Profile 保存 selection、revision、Skill/MCP 引用和 child policy。空白 Session 才能切换引擎；已有对话保持 engine identity，模型/reasoning 变化复用同一 native session/thread。

父子 Agent 使用独立 Harness Session，并通过 `parentSession`、`origin=subagent`、`delegationDepth` 建立 lineage。`allowedChildProfiles`、`maxChildDepth` 和 `maxConcurrentChildren` 必须授权；本地 MCP bridge 不传 credential。

## Skill / MCP 与安全

Skill/MCP 是 Profile 显式引用的用户运行资产，不是 Harness 内部资产的隐式注入。MCP static environment 禁止 secret-like key；credentialRef 由宿主 credential 服务解析。CLI tool call 只做事件投影，不冒充 Harness tool loop。

## 可复现发布门禁

```bash
pnpm install
npm run typecheck
npm test
npm run build
pnpm test
git diff --check
```

截至 2026-08-26 的真实基线是：`npm run typecheck` 通过；`npm test` 和 `pnpm test` 均为 **135 tests / 134 pass / 1 external skip**；`npm run build` 通过，并生成可发布的 Host、Remote、client bundle 与 client declaration artifacts。外部 skip 是真实 Claude E2E：它需要 Claude-compatible endpoint、认证环境变量、可执行的本地 `claude` CLI 和 GLM model；缺少任一前置时 skip 是显式结果，不得改成无条件通过。

pnpm 的独立仓库修复、依赖版本选择和 Typert generator 发布依赖见 `DESIGN-CLAUDE-PARITY.md` 的“pnpm 404 根因与修复”。
