import { agentEvents } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { ExternalCodexAgent } from './external-codex-agent.js';
/** Creates and registers external Codex Agents without replacing Harness core services. */
export class EngineSuiteAgentService {
    ctx;
    suite;
    live = new Set();
    constructor(ctx, suite) {
        this.ctx = ctx;
        this.suite = suite;
        ctx.effect(() => async () => {
            const handles = [...this.live];
            this.live.clear();
            await Promise.all(handles.map(handle => handle.dispose()));
        }, 'engine-suite.agents');
    }
    async createCodex(options) {
        const id = SessionId(options.sessionId);
        const profile = this.suite.resolveProfile(options.selection);
        const provider = this.suite.providers.get(profile.providerId);
        const model = this.suite.models.get(profile.modelRecordId);
        const launch = await this.suite.openCodex(options.selection, {
            apiKey: options.apiKey,
            cwd: options.cwd,
            ...options.executable === undefined ? {} : { executable: options.executable },
            ...options.args === undefined ? {} : { args: options.args },
        });
        let session;
        let agent;
        let detachSession;
        let detachAgent;
        try {
            session = this.ctx.sessions.prepare(id, { meta: { cwd: options.cwd } });
            const agentOptions = {
                provider: provider.id,
                model: model.modelId,
            };
            agent = new ExternalCodexAgent(this.ctx, id, agentOptions, session, launch.runtime, provider.id, model.modelId);
            detachSession = this.ctx.sessions.enter(session);
            detachAgent = this.ctx.agents.enter(agent, this.ctx.agent);
            this.ctx.sessions.announce(session);
            this.ctx.agents.announce(agent);
            agentEvents(this.ctx, agent).emit('agent/session-start', { source: 'startup' });
            const handle = {
                agent,
                session,
                profileId: profile.id,
                dispose: async () => {
                    if (!this.live.delete(handle))
                        return;
                    await agent.dispose();
                    detachAgent?.();
                    detachSession?.();
                    await launch.close();
                },
            };
            this.live.add(handle);
            return handle;
        }
        catch (error) {
            await agent?.dispose().catch(() => { });
            detachAgent?.();
            detachSession?.();
            await launch.close();
            throw error;
        }
    }
    list() {
        return [...this.live];
    }
}
//# sourceMappingURL=service.js.map