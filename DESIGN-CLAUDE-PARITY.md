# Claude/GLM 发布基线

- **审计日期**：2026-08-26
- **范围**：只描述本插件仓库 `/Users/zhuanzmima0000/Desktop/coding/person/deepseek-harness/deepseek-harness-plugin` 的当前实现与测试，不描述 `deepseek-harness` 源码。
- **发布结论**：当前可发布能力是 **GLM/Codex-only**：`claude-cli` 只允许 GLM 模型，`codex-cli` 使用 Codex app-server；Claude Opus 被过滤并在会话创建、模型切换和真实 E2E 前拒绝。
- **当前实现位置**：Claude 代码位于 `src/claude/{adapter,catalog,commands,control,mcp,persistence,requests,rewind,session,skills,subagents,transport,types}.ts`。仓库中不存在也不应再引用 `src/claude/launch.ts` 或 `src/claude/runtime.ts`；通用外部引擎事件与桥接位于 `src/agent/`。

## 当前架构

```text
Harness Session / Workspace / Approval
                 │
       Engine Suite Agent Service
                 │
       ExternalEngineAgent + Runtime
          ┌──────┴──────┐
   Claude GLM adapter  Codex adapter
          │                │
   claude stream-json  codex app-server
```

Harness 继续拥有 Session、Workspace、持久事件、Agent 生命周期和 Approval；插件拥有 Engine/Provider/Model/Reasoning catalog、外部进程、原生会话绑定、事件投影、Skill/MCP 资产和受策略约束的 child bridge。插件不建立第二套历史或 Workspace。

## 已验证能力

| 区域 | 当前事实 | 主要验收 |
| --- | --- | --- |
| Claude 初始化与会话 | 等待真实 `system/init` 后暴露 native session id；支持 resume、close、事件缓冲和订阅先于启动 | `tests/claude-foundation.test.ts`、`tests/claude-session.test.ts`、`tests/claude-transport.test.ts` |
| Claude 流与工具 | 归一化文本、tool call、tool result、result/error，并把权限请求交给 Harness Approval | `tests/claude-integration.test.ts`、`tests/claude-control.test.ts` |
| Claude catalog/命令 | 映射 SDK command/model；缓存、失效、分页错误和 slash 原始输入均有测试 | `tests/claude-catalog.test.ts`、`tests/claude-commands.test.ts` |
| Claude MCP/Skill/历史 | 用户资产使用 SDK 原生配置；credentialRef 由宿主解析；历史、导入、归档和 rewind 使用插件自有 native handle | `tests/claude-mcp.test.ts`、`tests/claude-skills.test.ts`、`tests/claude-persistence.test.ts`、`tests/claude-rewind.test.ts` |
| Codex | JSON-RPC、initialize、thread start/resume、turn、通知、权限、配置脱敏、模型发现和隔离 runtime 已覆盖 | `tests/codex-runtime.test.ts`、`tests/codex-requests.test.ts`、`tests/codex-model-policy.test.ts` |
| 编排/UI | 空白 Session 才可切换引擎；Engine → Provider → Model → Reasoning；父子 lineage、client remote 和 Session command catalog 已覆盖 | `tests/agent-bridge.test.ts`、`tests/parent-child.test.ts`、`tests/client-host-ui.test.ts`、`tests/client-remote.test.ts` |

## 不可违反的安全与模型策略

1. **Opus 禁止**：模型 catalog、selection、Claude session construction、model switch 和真实 E2E 均拒绝 Opus。
2. **无 Harness 注入**：Claude SDK options 不传 Harness system prompt、tool schema 或 Harness/cross-engine agent map；用户显式 Claude agent 定义只能通过 opt-in wrapper 进入 SDK 边界。
3. **凭据不落盘**：Provider 只保存 credentialRef；API token/key 只通过当前进程环境或内存解析，不进入 Settings、Session、`config.toml`、MCP 静态环境变量或日志。
4. **工具归属清晰**：CLI 自己执行原生工具，插件只投影事件，不把 CLI 工具调用伪装成 Harness tool loop。
5. **子 Agent 受策略授权**：child profile、深度、并发和 parent lineage 由插件策略控制，credential 不经 MCP 请求传递。

## 可复现门禁

在插件仓库根目录运行：

```bash
pnpm install
npm run typecheck
npm test
npm run build
pnpm test

git diff --check
```

截至 2026-08-26 的真实结果：`npm run typecheck` **通过**；`npm test` 和 `pnpm test` 均为 **135 tests / 134 pass / 1 external skip**；`npm run build` **通过**。构建后 `lib/types/client/index.d.ts` 等 client declaration artifacts 与 package exports 一致。

真实 Claude E2E 不属于无凭据单测：`tests/claude-real.e2e.test.ts` 需要可访问的 Claude-compatible `/v1/messages`（或 `ANTHROPIC_BASE_URL`）端点、认证环境变量、可执行的本地 `claude` CLI，以及非 Opus 的 GLM model。缺少这些外部前置时，该测试按设计 skip；它不能被改成静默通过，也不能用 fake query 代替真实 E2E。

真实 Claude E2E 示例：

```bash
DSH_CLAUDE_REAL_BASE_URI=... \
DSH_CLAUDE_REAL_AUTH_TOKEN=... \
DSH_CLAUDE_REAL_MODEL=glm-5.3 \
DSH_CLAUDE_REAL_EXECUTABLE=claude \
npm run test:claude-real
```

真实 Codex Smoke 同样需要外部 provider endpoint、API key 和本地 `codex app-server`；它只能通过环境变量提供凭据：

```bash
DSH_DEBUG_CODEX_BASE_URI=... \
DSH_DEBUG_CODEX_API_KEY="$CODEX_KEY" \
npm run verify:codex
```

## pnpm 404 根因与修复

404 不是 npm registry 临时故障，也不是父目录 workspace 误把本插件纳入 Harness workspace。独立目录复现同样失败，原因是插件旧 peer range `@deepseek-ai/dsh-session >=0.0.1-rc.1` 允许 pnpm 选择 `0.0.1-rc.1`；该旧版本的 peerDependencies 仍声明已删除且未发布的 `@deepseek-ai/dsh-type-meta`，所以 pnpm 自动安装 peer 时向 npm 请求它并得到 404。

同时，原锁文件固定 `autoInstallPeers: false`，而没有独立 workspace 配置的 pnpm 默认设置会造成 frozen lockfile 配置不一致；现有 `node_modules` 又是旧安装状态，因此 `pnpm test` 的依赖状态检查会先自动执行 `pnpm install`，把这个错误暴露出来。

根修复已在源头完成：

- 所有 DSH peer 的最低版本提升到当前发布线 `0.1.1-rc.2`，不再允许回退到保留旧 `dsh-type-meta` 的版本；
- 开发依赖显式安装当前 peer 版本，使独立插件仓库的 typecheck/build 不依赖父目录 symlink；
- 新增单包 `pnpm-workspace.yaml`，显式设置 `autoInstallPeers: false`，与 `pnpm-lock.yaml` 一致；
- `packageManager` 固定为 `pnpm@11.11.0`；
- 发布包直接提交生成后的 `lib/typert.*` artifacts；`scripts/generate-typert.mjs` 在源码重生成时只读父仓库的 generator/protocol 源码，不修改父仓库。

因此发布门禁不再通过改名 npm test、跳过安装或屏蔽失败来掩盖问题。
