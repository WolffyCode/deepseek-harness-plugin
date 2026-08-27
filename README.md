# @wolffycode/dsh-engine-suite

一个安装包、一个统一 Harness Session/Workspace 和两个外部 Agent 引擎：GLM-only 的 Claude CLI 与 Codex CLI。插件不修改 `deepseek-harness` 源码，不复制 Harness 历史或 Workspace。

## 当前能力

- `claude-cli`：Claude SDK stream-json，GLM model policy，模型发现、文本/工具/权限/命令/历史/恢复；
- `codex-cli`：Codex app-server JSON-RPC，thread resume，model discovery，隔离 runtime；
- Engine → Provider → Model → Reasoning 选择与 EngineProfile；
- Session attach、空白 Session 引擎切换、native session/thread binding；
- Skill/MCP 显式资产、credentialRef、child Agent policy 和本地认证 delegation bridge；
- 不向 CLI 注入 Harness System Prompt、Tool Schema 或 Harness/cross-engine agent map；
- Provider key 不落盘、不输出；Claude 真实验证只允许 GLM，并拒绝 Opus。

Claude 源码在 `src/claude/`，通用桥在 `src/agent/`，Codex 源码在 `src/codex/`。不存在旧的 Claude `launch.ts` 或 `runtime.ts` 文件。

## 独立安装

本仓库是单包 pnpm workspace，`pnpm-workspace.yaml` 固定 `autoInstallPeers: false`，`packageManager` 固定为 `pnpm@11.11.0`。`pnpm-lock.yaml` 与该设置一致，开发用 peer 依赖显式锁定在当前 Harness 发布线，因此安装和 test 不依赖父目录 workspace 或 symlink。发布包直接提交生成后的 `lib` artifacts；运行 typecheck/build 重新生成 Typert Remote artifacts 时，脚本只读父仓库中的 generator/protocol 源码。

```bash
pnpm install
npm run typecheck
npm test
npm run build
pnpm test
pnpm pack --dry-run
git diff --check
```

依赖安装和测试不读取父目录 `deepseek-harness`；typecheck/build 的 Typert 生成步骤会只读父仓库 generator/protocol 源码来生成 Remote artifact。npm 可用的旧 generator 不具备该能力，因此文档明确保留这个源码重生成前置，而不是用兼容层掩盖。

## pnpm 404 根因

旧配置把 `@deepseek-ai/dsh-session` 的 peer 下限写成 `>=0.0.1-rc.1`。pnpm 因此会选择仍声明已删除 `@deepseek-ai/dsh-type-meta` 的旧 `dsh-session`，自动安装时向 npm 请求该不存在的包并得到 404。另一个问题是锁文件的 `autoInstallPeers: false` 没有被独立 workspace 配置声明，默认 pnpm 设置会造成 frozen lockfile mismatch。

现在 peer 下限统一为 `0.1.1-rc.2`，单包 workspace 显式关闭 peer 自动安装，开发依赖和锁文件都来自当前发布线；这修复根因，不通过改用 npm test、跳过安装或隐藏失败规避。

## 外部 smoke

真实 Claude E2E 要求配置的 Provider 同时提供 Anthropic Messages API 的 `GET /v1/models` 和 `POST /v1/messages`、认证环境变量、可执行的本地 `claude` CLI，以及 GLM model；不做 OpenAI 伪适配。Preflight 明确返回 `endpoint-mismatch`、`auth`、`network` 或 `protocol` 分类；只有缺少必需外部环境变量时真实 E2E 才显式 skip，Provider endpoint mismatch 不得 skip。

真实 Provider 的结果必须以本次运行的 preflight 为准；不能用历史响应或只通过 `GET /v1/models` 推断 Claude CLI 可用。只实现 `/v1/models` 或仅提供 OpenAI 路由不能通过 Claude CLI 验证。

```bash
DSH_CLAUDE_REAL_BASE_URI=... \
DSH_CLAUDE_REAL_AUTH_TOKEN=... \
DSH_CLAUDE_REAL_MODEL=glm-5.3 \
DSH_CLAUDE_REAL_EXECUTABLE=claude \
npm run test:claude-real
```

认证 token 只通过当前进程环境和内存传递；验证诊断会脱敏，token 不写入 runtime 文件，也不出现在测试或脚本输出中。真实验证模型必须是 GLM，任何 Opus model 都会在请求前拒绝。

真实 Codex Smoke 需要 endpoint、API key 和本地 `codex app-server`，key 只通过环境变量传入：

```bash
DSH_DEBUG_CODEX_BASE_URI=... \
DSH_DEBUG_CODEX_API_KEY="$CODEX_KEY" \
npm run verify:codex
```

截至 2026-08-27，本地无凭据门禁 `pnpm test` 为 **162 tests / 160 pass / 0 fail / 2 external skips**；`pnpm typecheck`、`pnpm build`、`pnpm pack --dry-run` 和 `git diff --check` 均通过。两个 skip 仅来自缺少必需的真实 Claude Provider 环境变量；带凭据的真实 Claude、MCP/Skill 和浏览器 E2E 必须单独执行，不能由这两个 skip 代替。
