import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ControlError,
  NextTurnStateMachine,
  PermissionRegistry,
  applyAskUserAnswers,
  askUserResponseToPermission,
  toAskUserQuestion,
  toPermissionRequest,
  toSdkPermissionResult,
  createCanUseToolHandler,
  createOnUserDialogHandler,
} from '../src/claude/control.js'

class FakeTimer {
  private nextId = 0
  readonly tasks = new Map<number, () => void>()
  setTimeout = (callback: () => void): number => {
    const id = ++this.nextId
    this.tasks.set(id, callback)
    return id
  }
  clearTimeout = (id: number): void => { this.tasks.delete(id) }
  runAll(): void {
    const callbacks = [...this.tasks.values()]
    this.tasks.clear()
    for (const callback of callbacks) callback()
  }
}

function requestOptions(signal: AbortSignal, overrides: Record<string, unknown> = {}) {
  return {
    signal,
    requestId: 'sdk-request-1',
    toolUseID: 'tool-1',
    agentID: 'agent-1',
    suggestions: [{
      type: 'addRules' as const,
      rules: [{ toolName: 'Bash', ruleContent: 'git *' }],
      behavior: 'allow' as const,
      destination: 'session' as const,
    }],
    blockedPath: '/tmp/file.txt',
    decisionReason: 'outside allowed directory',
    title: 'Claude wants to read a file',
    displayName: 'Read file',
    description: 'Read access',
    matchedAskRule: { source: 'project', toolName: 'Read', ruleContent: 'Read(/tmp/**)' },
    ...overrides,
  }
}

test('maps CanUseTool input without leaking SDK-only values or mutating input', () => {
  const controller = new AbortController()
  const input = {
    path: '/tmp/file.txt',
    nested: { keep: true },
    password: 'do-not-return',
    callback: () => 'never',
  }
  const mapped = toPermissionRequest('Read', input, requestOptions(controller.signal), 'plan')

  assert.deepEqual(mapped, {
    requestId: 'sdk-request-1',
    toolName: 'Read',
    toolUseId: 'tool-1',
    agentId: 'agent-1',
    input: { path: '/tmp/file.txt', nested: { keep: true }, password: '[REDACTED]' },
    suggestions: [{
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'git *' }],
      behavior: 'allow',
      destination: 'session',
    }],
    blockedPath: '/tmp/file.txt',
    decisionReason: 'outside allowed directory',
    title: 'Claude wants to read a file',
    displayName: 'Read file',
    description: 'Read access',
    matchedAskRule: { source: 'project', toolName: 'Read', ruleContent: 'Read(/tmp/**)' },
    permissionMode: 'plan',
  })
  assert.equal('signal' in mapped, false)
  assert.equal('callback' in mapped.input, false)
  assert.notStrictEqual(mapped.input, input)
  assert.notStrictEqual(mapped.input.nested, input.nested)
  assert.equal(input.password, 'do-not-return')
})

test('maps all SDK permission result branches and all permission update variants', () => {
  const updates = [
    { type: 'addRules' as const, rules: [{ toolName: 'Read' }], behavior: 'allow' as const, destination: 'userSettings' as const },
    { type: 'replaceRules' as const, rules: [{ toolName: 'Bash', ruleContent: 'npm *' }], behavior: 'deny' as const, destination: 'projectSettings' as const },
    { type: 'removeRules' as const, rules: [{ toolName: 'Write' }], behavior: 'allow' as const, destination: 'localSettings' as const },
    { type: 'setMode' as const, mode: 'auto' as const, destination: 'session' as const },
    { type: 'addDirectories' as const, directories: ['/tmp'], destination: 'cliArg' as const },
    { type: 'removeDirectories' as const, directories: ['/tmp'], destination: 'session' as const },
  ]
  assert.deepEqual(toSdkPermissionResult({ behavior: 'allow', updatedInput: { answer: 'yes' }, updatedPermissions: updates, toolUseId: 'tool-1' }), {
    behavior: 'allow', updatedInput: { answer: 'yes' }, updatedPermissions: updates, toolUseID: 'tool-1',
  })
  assert.deepEqual(toSdkPermissionResult({ behavior: 'deny', message: 'No', interrupt: true, toolUseId: 'tool-1' }), {
    behavior: 'deny', message: 'No', interrupt: true, toolUseID: 'tool-1',
  })
})

test('permission registry resolves, rejects duplicate and unknown operations, and cleans timer/listener', async () => {
  const timer = new FakeTimer()
  let now = 100
  const controller = new AbortController()
  const registry = new PermissionRegistry({ clock: () => now, id: () => 'generated', timer, defaultTimeoutMs: 10 })
  const promise = registry.begin({ requestId: 'p1', toolName: 'Read', input: {}, permissionMode: 'default' }, { signal: controller.signal })
  assert.equal(registry.stateOf('p1'), 'pending')
  assert.equal(registry.pending().length, 1)
  assert.throws(() => registry.begin({ requestId: 'p1', toolName: 'Read', input: {}, permissionMode: 'default' }), (error: unknown) => error instanceof ControlError && error.code === 'duplicate')
  assert.equal(registry.respond('unknown', { behavior: 'allow' }).ok, false)
  assert.equal(registry.respond('p1', { behavior: 'allow' }).ok, true)
  assert.deepEqual(await promise, { behavior: 'allow' })
  assert.equal(registry.stateOf('p1'), 'resolved')
  assert.equal(registry.pending().length, 0)
  assert.equal(timer.tasks.size, 0)
  controller.abort()

  const expiring = registry.begin({ requestId: 'p2', toolName: 'Bash', input: {}, permissionMode: 'default' })
  now = 111
  registry.expireDue()
  await assert.rejects(expiring, (error: unknown) => error instanceof ControlError && error.code === 'timeout')
  assert.equal(registry.stateOf('p2'), 'expired')
  const canceled = registry.begin({ requestId: 'p3', toolName: 'Write', input: {}, permissionMode: 'default' })
  assert.equal(registry.cancel('p3').ok, true)
  await assert.rejects(canceled, (error: unknown) => error instanceof ControlError && error.code === 'canceled')
  assert.equal(registry.stateOf('p3'), 'canceled')
})

test('abort and cancelAll settle every pending promise and remove abort listeners', async () => {
  const controller = new AbortController()
  const registry = new PermissionRegistry({ id: () => 'id' })
  const first = registry.begin({ requestId: 'first', toolName: 'Read', input: {}, permissionMode: 'default' }, { signal: controller.signal })
  controller.abort()
  await assert.rejects(first, (error: unknown) => error instanceof ControlError && error.code === 'canceled')
  const second = registry.begin({ requestId: 'second', toolName: 'Read', input: {}, permissionMode: 'default' })
  const third = registry.begin({ requestId: 'third', toolName: 'Read', input: {}, permissionMode: 'default' })
  assert.equal(registry.cancelAll().length, 2)
  await assert.rejects(second, (error: unknown) => error instanceof ControlError && error.code === 'canceled')
  await assert.rejects(third, (error: unknown) => error instanceof ControlError && error.code === 'canceled')
  assert.equal(registry.pending().length, 0)
})

test('CanUseTool and OnUserDialog handlers map fake SDK callbacks transparently', async () => {
  let receivedRequestId = ''
  const permissionHandler = createCanUseToolHandler(async request => {
    receivedRequestId = request.requestId
    return { behavior: 'allow', updatedInput: { approved: true } }
  }, { permissionMode: 'acceptEdits' })
  const permission = await permissionHandler('Read', { path: '/tmp/a' }, requestOptions(new AbortController().signal))
  assert.deepEqual(permission, { behavior: 'allow', updatedInput: { approved: true } })
  assert.equal(receivedRequestId, 'sdk-request-1')

  const dialogHandler = createOnUserDialogHandler(async request => ({ behavior: 'completed', result: { kind: request.dialogKind, payload: request.payload } }))
  const dialog = await dialogHandler({ dialogKind: 'confirm', payload: { value: 'x' }, toolUseID: 'tool-2' }, { signal: new AbortController().signal, requestId: 'dialog-1' })
  assert.deepEqual(dialog, { behavior: 'completed', result: { kind: 'confirm', payload: { value: 'x' } } })
  const canceled = await createOnUserDialogHandler(async () => ({ behavior: 'cancelled' }))(
    { dialogKind: 'unknown', payload: {} }, { signal: new AbortController().signal, requestId: 'dialog-2' },
  )
  assert.deepEqual(canceled, { behavior: 'cancelled' })
})

test('AskUserQuestion aligns header answers to question keys and preserves source input', () => {
  const input = {
    questions: [
      { question: 'Pick a color', header: 'Color', options: [{ label: 'Red' }, { label: 'Blue' }], multiSelect: false },
      { question: 'Pick tools', header: 'Tools', options: [{ label: 'Git' }], multiSelect: true, allowOther: true },
    ],
    untouched: true,
  }
  const request = toAskUserQuestion('AskUserQuestion', input, requestOptions(new AbortController().signal))
  assert.equal(request.kind, 'ask_user_question')
  const response = askUserResponseToPermission(request, { behavior: 'completed', answers: { Color: 'Red', Tools: ['Git', 'Other'] } })
  assert.deepEqual(response, {
    behavior: 'allow',
    updatedInput: {
      questions: [
        { question: 'Pick a color', header: 'Color', options: [{ label: 'Red' }, { label: 'Blue' }], multiSelect: false },
        { question: 'Pick tools', header: 'Tools', options: [{ label: 'Git' }], multiSelect: true },
      ],
      untouched: true,
      answers: { 'Pick a color': 'Red', 'Pick tools': ['Git', 'Other'] },
    },
  })
  assert.deepEqual(input.questions[1], { question: 'Pick tools', header: 'Tools', options: [{ label: 'Git' }], multiSelect: true, allowOther: true })
  assert.deepEqual(askUserResponseToPermission(request, { behavior: 'cancelled' }), { behavior: 'deny', message: 'User cancelled the question' })
})

test('next-turn state keeps current stable until explicit commit and rejects stale operations', () => {
  const state = new NextTurnStateMachine({ mode: 'default' })
  const first = state.request({ mode: 'plan' })
  assert.deepEqual(state.current, { mode: 'default' })
  assert.deepEqual(state.pending, { mode: 'plan' })
  assert.equal(state.snapshot().epoch, 1)
  assert.equal(state.commit(first).ok, true)
  assert.deepEqual(state.current, { mode: 'plan' })
  const stale = state.request({ mode: 'auto' })
  const newer = state.request({ mode: 'dontAsk' })
  assert.equal(state.rollback(stale).ok, false)
  assert.equal(state.commit(newer).ok, true)
  assert.deepEqual(state.current, { mode: 'dontAsk' })
  assert.equal(state.rollback(newer).ok, false)
  assert.equal(state.snapshot().version, 3)
})

test('AskUserQuestion helper accepts direct answers without changing the original object', () => {
  const input = { questions: [{ question: 'Name', header: 'N', options: [], multiSelect: false }] }
  const updated = applyAskUserAnswers(input, { N: 'Ada' })
  assert.deepEqual(updated['answers'], { Name: 'Ada' })
  assert.notStrictEqual(updated, input)
  assert.deepEqual(input, { questions: [{ question: 'Name', header: 'N', options: [], multiSelect: false }] })
})
