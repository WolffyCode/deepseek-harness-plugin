import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import { createEngineSuiteRuntime } from '../src/engine-suite.js'
import { EngineSuiteAgentService } from '../src/agent/service.js'

interface RealConfig {
  readonly claudeBaseUri: string
  readonly claudeAuthToken: string
  readonly claudeModel: string
  readonly claudeExecutable: string
  readonly codexBaseUri: string
  readonly codexApiKey: string
  readonly codexModel: string
  readonly codexExecutable: string
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = env(name)
    if (value !== undefined) return value
  }
  return undefined
}

function realConfig(): { readonly config?: RealConfig; readonly skip: string | false } {
  const enabled = env('DSH_ENGINE_SUITE_REAL_E2E') === '1'
  const claudeBaseUri = firstEnv('DSH_CLAUDE_REAL_BASE_URI', 'DSH_DEBUG_GLM_BASE_URI', 'ANTHROPIC_BASE_URL')
  const claudeAuthToken = firstEnv('DSH_CLAUDE_REAL_AUTH_TOKEN', 'DSH_DEBUG_GLM_AUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN')
  const codexBaseUri = firstEnv('DSH_CODEX_REAL_BASE_URI', 'DSH_DEBUG_CODEX_BASE_URI')
  const codexApiKey = firstEnv('DSH_CODEX_REAL_API_KEY', 'DSH_DEBUG_CODEX_API_KEY', 'OPENAI_API_KEY')
  const missing = [
    enabled ? undefined : 'DSH_ENGINE_SUITE_REAL_E2E=1',
    claudeBaseUri === undefined ? 'DSH_CLAUDE_REAL_BASE_URI or ANTHROPIC_BASE_URL' : undefined,
    claudeAuthToken === undefined ? 'DSH_CLAUDE_REAL_AUTH_TOKEN or ANTHROPIC_AUTH_TOKEN' : undefined,
    codexBaseUri === undefined ? 'DSH_CODEX_REAL_BASE_URI' : undefined,
    codexApiKey === undefined ? 'DSH_CODEX_REAL_API_KEY or OPENAI_API_KEY' : undefined,
  ].filter((value): value is string => value !== undefined)
  if (missing.length > 0) return { skip: `real cross-engine E2E disabled or missing environment: ${missing.join(', ')}` }
  return {
    skip: false,
    config: {
      claudeBaseUri: claudeBaseUri!,
      claudeAuthToken: claudeAuthToken!,
      claudeModel: env('DSH_CLAUDE_REAL_MODEL') ?? 'glm-5.3',
      claudeExecutable: env('DSH_CLAUDE_REAL_EXECUTABLE') ?? 'claude',
      codexBaseUri: codexBaseUri!,
      codexApiKey: codexApiKey!,
      codexModel: env('DSH_CODEX_REAL_MODEL') ?? 'gpt-5.6',
      codexExecutable: env('DSH_CODEX_REAL_EXECUTABLE') ?? 'codex',
    },
  }
}

function registerProfiles(suite: ReturnType<typeof createEngineSuiteRuntime>, config: RealConfig): void {
  suite.providers.register({ id: 'real-claude-provider', engineId: 'claude-cli', name: 'Real Claude', baseUri: config.claudeBaseUri, credentialRef: 'real-claude-token' })
  suite.providers.register({ id: 'real-codex-provider', engineId: 'codex-cli', name: 'Real Codex', baseUri: config.codexBaseUri, credentialRef: 'real-codex-key' })
  suite.models.register({ id: 'real-claude-model', engineId: 'claude-cli', providerId: 'real-claude-provider', modelId: config.claudeModel, reasoningOptions: [{ id: 'high' }], source: 'manual' })
  suite.models.register({ id: 'real-codex-model', engineId: 'codex-cli', providerId: 'real-codex-provider', modelId: config.codexModel, reasoningOptions: [{ id: 'high' }], source: 'manual' })
  suite.profiles.register({
    id: 'real-claude-parent',
    selection: { engineId: 'claude-cli', providerId: 'real-claude-provider', modelRecordId: 'real-claude-model', reasoningEffort: 'high' },
    allowedChildProfiles: ['real-codex-child'],
    maxChildDepth: 1,
    maxConcurrentChildren: 1,
  })
  suite.profiles.register({
    id: 'real-codex-parent',
    selection: { engineId: 'codex-cli', providerId: 'real-codex-provider', modelRecordId: 'real-codex-model', reasoningEffort: 'high' },
    allowedChildProfiles: ['real-claude-child'],
    maxChildDepth: 1,
    maxConcurrentChildren: 1,
  })
  suite.profiles.register({ id: 'real-codex-child', selection: { engineId: 'codex-cli', providerId: 'real-codex-provider', modelRecordId: 'real-codex-model', reasoningEffort: 'high' } })
  suite.profiles.register({ id: 'real-claude-child', selection: { engineId: 'claude-cli', providerId: 'real-claude-provider', modelRecordId: 'real-claude-model', reasoningEffort: 'high' } })
}

async function createRealService(config: RealConfig): Promise<{ readonly service: EngineSuiteAgentService; readonly ctx: Context; readonly suite: ReturnType<typeof createEngineSuiteRuntime> }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const suite = createEngineSuiteRuntime()
  registerProfiles(suite, config)
  const credentials = new Map([
    ['real-claude-token', config.claudeAuthToken],
    ['real-codex-key', config.codexApiKey],
  ])
  const service = new EngineSuiteAgentService(ctx, suite, reference => credentials.get(reference) ?? '')
  return { service, ctx, suite }
}

const configured = realConfig()

test('real Claude to Codex child delegation (opt-in)', { skip: configured.skip }, async () => {
  const config = configured.config!
  const { service, suite } = await createRealService(config)
  const parent = await service.createExternal({
    sessionId: 'real-claude-parent-session',
    selection: suite.profiles.get('real-claude-parent').selection,
    apiKey: config.claudeAuthToken,
    cwd: process.cwd(),
    executable: config.claudeExecutable,
  })
  try {
    const child = await service.delegate('real-claude-parent-session', { profileId: 'real-codex-child', task: 'Reply with a short confirmation that the cross-engine child task completed.' })
    assert.equal(child.lineage.parentSessionId, 'real-claude-parent-session')
    assert.equal(child.lineage.childSessionId, String(child.handle.session.id))
    assert.equal(child.lineage.nativeTaskId, child.handle.nativeTaskId)
    assert.notEqual(child.text.trim(), '')
    await child.handle.dispose()
  } finally {
    await parent.dispose()
    for (const handle of service.list()) await handle.dispose()
  }
})

test('real Codex to Claude child delegation (opt-in)', { skip: configured.skip }, async () => {
  const config = configured.config!
  const { service, suite } = await createRealService(config)
  const parent = await service.createExternal({
    sessionId: 'real-codex-parent-session',
    selection: suite.profiles.get('real-codex-parent').selection,
    apiKey: config.codexApiKey,
    cwd: process.cwd(),
    executable: config.codexExecutable,
  })
  try {
    const child = await service.delegate('real-codex-parent-session', { profileId: 'real-claude-child', task: 'Reply with a short confirmation that the cross-engine child task completed.' })
    assert.equal(child.lineage.parentSessionId, 'real-codex-parent-session')
    assert.equal(child.lineage.childSessionId, String(child.handle.session.id))
    assert.equal(child.lineage.nativeTaskId, child.handle.nativeTaskId)
    assert.notEqual(child.text.trim(), '')
    await child.handle.dispose()
  } finally {
    await parent.dispose()
    for (const handle of service.list()) await handle.dispose()
  }
})
