import assert from 'node:assert/strict'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CodexProcess } from '../src/codex/process.js'

async function nextLine(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk: Buffer | string): void => {
      buffer += String(chunk)
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      stream.off('data', onData)
      stream.off('error', onError)
      resolve(buffer.slice(0, newline))
    }
    const onError = (error: Error): void => {
      stream.off('data', onData)
      reject(error)
    }
    stream.on('data', onData)
    stream.once('error', onError)
  })
}

async function processIsGone(pid: number): Promise<void> {
  const started = Date.now()
  while (true) {
    try {
      process.kill(pid, 0)
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return
      throw error
    }
    if (Date.now() - started > 2_000) throw new Error(`process ${pid} is still running`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test('CodexProcess separates stdio, isolates inherited API keys, and redacts split stderr secrets', async () => {
  const hostOpenAi = `codex-host-openai-${process.pid}`
  const hostCodex = `codex-host-codex-${process.pid}`
  const hostDebug = `codex-host-debug-${process.pid}`
  const childMarker = `codex-child-marker-${process.pid}`
  const apiKey = 'codex-process-api-key'
  const original = {
    openAi: process.env['OPENAI_API_KEY'],
    codex: process.env['CODEX_API_KEY'],
    debug: process.env['DSH_DEBUG_CODEX_API_KEY'],
  }
  process.env['OPENAI_API_KEY'] = 'host-openai-secret'
  process.env['CODEX_API_KEY'] = 'host-codex-secret'
  process.env['DSH_DEBUG_CODEX_API_KEY'] = 'host-debug-secret'
  const script = [
    "const [openAi,codex,debug,marker]=process.argv.slice(1);",
    "process.stderr.write('split-codex-');",
    "setTimeout(()=>process.stderr.write('process-secret\\n'),5);",
    "process.stdout.write(JSON.stringify({openAi:process.env[openAi],codex:process.env[codex],debug:process.env[debug],marker:process.env[marker]})+'\\n');",
    "process.stdin.on('data',()=>{});",
  ].join('')
  const child = CodexProcess.start({
    executable: process.execPath,
    args: ['-e', script, 'OPENAI_API_KEY', 'CODEX_API_KEY', 'DSH_DEBUG_CODEX_API_KEY', childMarker],
    cwd: process.cwd(),
    env: { [childMarker]: 'present', OPENAI_API_KEY: apiKey },
    redactions: ['split-codex-process-secret'],
    disposeGraceMs: 50,
  })
  try {
    const values = JSON.parse(await nextLine(child.child.stdout)) as Record<string, unknown>
    assert.equal(values['openAi'], apiKey)
    assert.equal(values['codex'], undefined)
    assert.equal(values['debug'], undefined)
    assert.equal(values['marker'], 'present')
    const exit = await child.dispose()
    assert.equal(exit.signal, null)
    assert.equal(child.stderrTail, '[REDACTED]\n')
  } finally {
    if (original.openAi === undefined) delete process.env['OPENAI_API_KEY']
    else process.env['OPENAI_API_KEY'] = original.openAi
    if (original.codex === undefined) delete process.env['CODEX_API_KEY']
    else process.env['CODEX_API_KEY'] = original.codex
    if (original.debug === undefined) delete process.env['DSH_DEBUG_CODEX_API_KEY']
    else process.env['DSH_DEBUG_CODEX_API_KEY'] = original.debug
    await child.dispose()
  }
})

test('CodexProcess scrubs API keys from shell snapshots and stops its scrubber on exit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-process-snapshot-'))
  const snapshotRoot = join(root, 'shell_snapshots')
  const snapshot = join(snapshotRoot, 'command.txt')
  const secret = 'snapshot-codex-secret'
  await mkdir(snapshotRoot, { recursive: true })
  await writeFile(snapshot, `command ${secret}\n`, 'utf8')
  const child = CodexProcess.start({
    executable: process.execPath,
    args: ['-e', 'process.stdin.on(\'data\',()=>{}); setInterval(()=>{},1000)'],
    cwd: process.cwd(),
    env: { CODEX_HOME: root },
    redactions: [secret],
    disposeGraceMs: 25,
  })
  try {
    await child.dispose()
    assert.equal(await readFile(snapshot, 'utf8'), 'command [REDACTED]\n')
  } finally {
    await child.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('CodexProcess reports abnormal exits and makes dispose idempotent', async () => {
  const child = CodexProcess.start({
    executable: process.execPath,
    args: ['-e', "process.stderr.write('abnormal'); process.exit(7)"],
    cwd: process.cwd(),
    redactions: ['abnormal'],
    disposeGraceMs: 25,
  })
  const exit = await child.exited
  assert.equal(exit.code, 7)
  assert.equal(exit.signal, null)
  assert.equal(exit.stderr, '[REDACTED]')
  const first = await child.dispose()
  const second = await child.dispose()
  assert.deepEqual(second, first)
})

test('CodexProcess resolves spawn failures with a redacted error', async () => {
  const secret = 'codex-spawn-error-secret'
  const child = CodexProcess.start({
    executable: `/tmp/${secret}`,
    args: [],
    cwd: process.cwd(),
    redactions: [secret],
    disposeGraceMs: 25,
  })
  const exit = await child.exited
  assert.equal(exit.code, null)
  assert.equal(exit.signal, null)
  assert.equal(exit.error?.message.includes(secret), false)
  assert.match(exit.error?.message ?? '', /spawn|ENOENT|not found/i)
  assert.deepEqual(await child.dispose(), exit)
})

test('CodexProcess validates the close grace before spawning a child', () => {
  assert.throws(() => CodexProcess.start({
    executable: `/tmp/codex-invalid-grace-${process.pid}`,
    args: [],
    cwd: process.cwd(),
    disposeGraceMs: Number.NaN,
  }), /finite non-negative number/)
})

test('CodexProcess kills the detached process group when graceful close times out', async () => {
  const child = CodexProcess.start({
    executable: process.execPath,
    args: ['-e', [
      "const {spawn}=require('node:child_process');",
      "const grandchild=spawn(process.execPath,['-e','process.on(\\'SIGTERM\\',()=>{}); setInterval(()=>{},1000)'],{stdio:'ignore'});",
      "process.stdout.write(String(grandchild.pid)+'\\n');",
      "setInterval(()=>{},1000);",
    ].join('')],
    cwd: process.cwd(),
    disposeGraceMs: 25,
  })
  const grandchildPid = Number.parseInt(await nextLine(child.child.stdout), 10)
  assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0)
  const exit = await child.dispose()
  assert.ok(exit.signal === 'SIGTERM' || exit.signal === 'SIGKILL')
  await processIsGone(grandchildPid)
})
