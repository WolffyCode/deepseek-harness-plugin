import type { ClientContext, ISessions, SessionId, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import engineSuiteRemote from '@wolffycode/dsh-engine-suite/remote'
import type {} from '@wolffycode/dsh-engine-suite/remote'
import { ENGINE_SUITE_SETTINGS_NAMESPACE } from './settings.js'
import type { EngineSuiteSettings } from '../settings.js'
import { EngineSuiteComposerSelector } from './EngineSuiteComposerSelector.js'
import { setEngineSuiteComposerRuntime, setEngineSuiteSessionSelection } from './composer-runtime.js'
import { createEngineSuiteCatalogController, type EngineSuiteCatalogController, type EngineSuiteRemoteGateway } from './catalog.js'
import { EngineSuiteSection } from './EngineSuiteSection.js'
import { createEngineSuiteAgentPresetFace } from './agent-preset.js'
import { mountCliSlashSource } from './cli-slash.js'
import { EngineSuiteRealtimeActivity } from './EngineSuiteRealtimeActivity.js'
import { createEngineSuiteActivityStore } from './realtime-ui.js'

/** The root half only needs the Remote service so it can mount this package's contribution. */
export const inject = ['remote']

interface ClientSessionList {
  readonly getSnapshot: () => { readonly byId: Record<string, unknown> }
}

interface ClientSessionsAccess {
  readonly list: ClientSessionList
  open(sessionId: string): void
}

function clientSessions(ctx: ClientContext): ClientSessionsAccess {
  return ctx.get('sessions') as unknown as ClientSessionsAccess
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function openSessionWhenListed(ctx: ClientContext, sessionId: string): Promise<void> {
  const sessions = clientSessions(ctx)
  for (let attempt = 0; attempt < 40; attempt++) {
    if (sessions.list.getSnapshot().byId[sessionId] !== undefined) {
      sessions.open(sessionId)
      return
    }
    await wait(50)
  }
  throw new Error(`created Engine Suite session was not announced: ${sessionId}`)
}

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(engineSuiteRemote)
  const child = ctx.plugin({
    inject: ['remote.engineSuiteGateway', 'slots', 'settingsScope', 'sessions', 'connection', 'inputTriggers'],
    apply: (surfaceCtx: ClientContext): void => {
      const gateway = surfaceCtx.remote.engineSuiteGateway as unknown as EngineSuiteRemoteGateway
      const agentPreset = createEngineSuiteAgentPresetFace(surfaceCtx.get('connection') as ConnectionHandle)
      const catalog: EngineSuiteCatalogController = createEngineSuiteCatalogController(gateway)
      const activityStore = createEngineSuiteActivityStore()
      const sessions = surfaceCtx.get('sessions') as ISessions
      void catalog.refresh().catch(() => undefined)
      setEngineSuiteComposerRuntime({
        catalog,
        createAgent: async request => { await catalog.createAgent(request) },
        openSession: (sessionId: string) => openSessionWhenListed(surfaceCtx, sessionId),
        switchAgent: async request => { await catalog.switchAgent(request) },
        setSessionSelection: setEngineSuiteSessionSelection,
      })

      const disposeCliSlash = mountCliSlashSource(surfaceCtx)
      surfaceCtx.effect(() => disposeCliSlash, 'engine-suite.cli-slash')

      surfaceCtx.slots.inject('settings.section', () => surfaceCtx.slots.register({
        name: 'settings.section',
        id: 'engine-suite',
        order: 20,
        label: 'Engines',
        inject: () => ({
          scope: surfaceCtx.settingsScope.bind<EngineSuiteSettings>({ namespace: ENGINE_SUITE_SETTINGS_NAMESPACE }),
          catalog,
        }),
      }, EngineSuiteSection))

      surfaceCtx.slots.inject('conversation.hero.agentPreset', () => surfaceCtx.slots.register({
        name: 'conversation.hero.agentPreset',
        priority: -100,
      }, () => null))

      surfaceCtx.slots.inject('conversation.input.model', () => surfaceCtx.slots.register({
        name: 'conversation.input.model',
        priority: -10,
        inject: () => ({ agentPreset }),
      }, EngineSuiteComposerSelector))

      // The dock is the client-owned live activity seam. It receives the
      // Host's incrementally published session snapshot, so the first
      // working frame does not wait for a provider token or turn completion.
      surfaceCtx.slots.inject('conversation.input.dock', () => surfaceCtx.slots.register({
        name: 'conversation.input.dock',
        id: 'engine-suite-realtime',
        order: -100,
        inject: (sessionId: SessionId) => ({
          activityStore,
          stop: async () => {
            const conversation = sessions.scope(sessionId)?.get('conversation')
            if (conversation === undefined) throw new Error(`conversation unavailable for session ${String(sessionId)}`)
            await conversation.cancel()
          },
        }),
      }, EngineSuiteRealtimeActivity))
      surfaceCtx.effect(() => () => activityStore.clear(), 'engine-suite.realtime-activity-store')
    },
  })
  await child.await()

  return async () => {
    await child.dispose()
    setEngineSuiteComposerRuntime(undefined)
    await disposeRemote()
  }
}

export type { EngineSuiteSettings, SettingsScope }
