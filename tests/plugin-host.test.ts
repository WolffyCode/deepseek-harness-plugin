import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent, type AgentFactory } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { apply } from '../src/plugin.js'

const patchPath = new URL('../cordis.patch.yml', import.meta.url)

test('bundle patch keeps the Harness native AgentFactory and only mounts Engine Suite capabilities', () => {
  const patch = readFileSync(patchPath, 'utf8')
  assert.doesNotMatch(patch, /agent-loop[\s\S]*disabled:\s*true/u)
  assert.match(
    patch,
    /- insert:\s+- id: engine-suite\s+name: '@wolffycode\/dsh-engine-suite'/us,
  )
  assert.doesNotMatch(patch, /primary:\s*true/u)
  assert.equal((patch.match(/^\s*- id: engine-suite$/gmu) ?? []).length, 1)
})

test('plugin does not replace the Host AgentFactory or enter Harness LLM generation', () => {
  const services = new Map<string, unknown>()
  let setFactoryCalls = 0
  let registeredFactory: unknown
  let llmCalls = 0
  services.set('agents', {
    setFactory(value: unknown): () => void {
      registeredFactory = value
      setFactoryCalls += 1
      return () => { registeredFactory = undefined }
    },
  })
  services.set('llm', {
    registerAdapter(): never {
      llmCalls += 1
      throw new Error('Harness LLM must not be touched by the Engine Suite mount')
    },
  })

  const ctx = {
    get: (key: string): unknown => services.get(key),
    effect: (): void => undefined,
    provide: (key: string, value: unknown): void => { services.set(key, value) },
    plugin: (): void => undefined,
    inject: (): void => undefined,
  } as unknown as Context

  const original = {
    codexBaseUri: process.env['DSH_DEBUG_CODEX_BASE_URI'],
    codexApiKey: process.env['DSH_DEBUG_CODEX_API_KEY'],
    glmBaseUri: process.env['DSH_DEBUG_GLM_BASE_URI'],
    glmApiKey: process.env['DSH_DEBUG_GLM_AUTH_TOKEN'],
    anthropicBaseUri: process.env['ANTHROPIC_BASE_URL'],
    anthropicApiKey: process.env['ANTHROPIC_AUTH_TOKEN'],
  }
  delete process.env['DSH_DEBUG_CODEX_BASE_URI']
  delete process.env['DSH_DEBUG_CODEX_API_KEY']
  delete process.env['DSH_DEBUG_GLM_BASE_URI']
  delete process.env['DSH_DEBUG_GLM_AUTH_TOKEN']
  delete process.env['ANTHROPIC_BASE_URL']
  delete process.env['ANTHROPIC_AUTH_TOKEN']
  try {
    apply(ctx)
  } finally {
    const restore = (key: string, value: string | undefined): void => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    restore('DSH_DEBUG_CODEX_BASE_URI', original.codexBaseUri)
    restore('DSH_DEBUG_CODEX_API_KEY', original.codexApiKey)
    restore('DSH_DEBUG_GLM_BASE_URI', original.glmBaseUri)
    restore('DSH_DEBUG_GLM_AUTH_TOKEN', original.glmApiKey)
    restore('ANTHROPIC_BASE_URL', original.anthropicBaseUri)
    restore('ANTHROPIC_AUTH_TOKEN', original.anthropicApiKey)
  }

  assert.equal(setFactoryCalls, 0)
  const nativeFactory = {}
  const releaseNativeFactory = (services.get('agents') as { setFactory(value: unknown): () => void }).setFactory(nativeFactory)
  assert.equal(registeredFactory, nativeFactory)
  releaseNativeFactory()
  assert.equal(registeredFactory, undefined)
  assert.ok(services.get('engineSuite'))
  assert.equal(llmCalls, 0)
})


test('new blank Session creation remains on the native factory with no external Provider', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  apply(ctx)

  let nativeCreateCalls = 0
  const nativeFactory: AgentFactory = {
    createAgent: async (_ownerCtx, options) => {
      nativeCreateCalls += 1
      const session = ctx.sessions.create(options.sessionId, options.meta === undefined ? {} : { meta: options.meta })
      const agent = { id: options.sessionId, session } as Agent
      return { agent, dispose: async () => undefined }
    },
    resume: async () => { throw new Error('native resume is not part of this blank-session test') },
  }
  const release = ctx.agents.setFactory(nativeFactory)
  try {
    const created = await ctx.agents.create({ sessionId: SessionId('native-blank'), meta: { cwd: process.cwd() } })
    assert.equal(nativeCreateCalls, 1)
    assert.equal(created.agent.id, SessionId('native-blank'))
    assert.equal(created.agent.session.header.cwd, process.cwd())
    const engineSuite = ctx.get('engineSuite') as unknown as { agents: { list(): readonly unknown[] }; providers: { list(): readonly unknown[] } }
    assert.equal(engineSuite.agents.list().length, 0)
    assert.equal(engineSuite.providers.list().length, 0)
  } finally {
    release()
    await ctx.fiber.dispose()
  }
})
