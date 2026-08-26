import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/plugin.js'

const patchPath = new URL('../cordis.patch.yml', import.meta.url)

test('bundle patch disables the native agent loop and installs one primary Engine Suite entry', () => {
  const patch = readFileSync(patchPath, 'utf8')
  assert.match(patch, /- id: agent-loop\s+disabled: true/u)
  assert.match(
    patch,
    /- insert:\s+- id: engine-suite\s+name: '@wolffycode\/dsh-engine-suite'\s+config:\s+primary: true/us,
  )
  assert.equal((patch.match(/^[ \t]*- id: engine-suite$/gmu) ?? []).length, 1)
})

test('primary plugin registers its AgentFactory without entering Harness LLM generation', () => {
  const services = new Map<string, unknown>()
  let factory: unknown
  let factoryCalls = 0
  let llmCalls = 0
  services.set('agents', {
    setFactory(value: unknown): void {
      factory = value
      factoryCalls += 1
    },
  })
  services.set('llm', {
    registerAdapter(): never {
      llmCalls += 1
      throw new Error('Harness LLM must not be touched by the primary boundary')
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
    apply(ctx, { primary: true })
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

  assert.equal(factoryCalls, 1)
  assert.ok(factory)
  assert.equal(typeof (factory as { readonly createAgent: unknown }).createAgent, 'function')
  assert.equal(llmCalls, 0)
})
