import assert from 'node:assert/strict'
import test from 'node:test'
import { ClaudeProcess } from '../src/claude/process.js'

class LineReader {
  private buffer = ''
  private readonly lines: string[] = []
  private readonly waiters: Array<(line: string) => void> = []

  constructor(private readonly stream: NodeJS.ReadableStream) {
    stream.setEncoding?.('utf8')
    stream.on('data', chunk => this.push(String(chunk)))
  }

  next(): Promise<string> {
    const line = this.lines.shift()
    if (line !== undefined) return Promise.resolve(line)
    return new Promise(resolve => this.waiters.push(resolve))
  }

  private push(chunk: string): void {
    this.buffer += chunk
    while (true) {
      const newline = this.buffer.indexOf('\n')
      if (newline < 0) return
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      const waiter = this.waiters.shift()
      if (waiter) waiter(line)
      else this.lines.push(line)
    }
  }
}

test('ClaudeProcess isolates the environment and preserves stdin/stdout streaming', async () => {
  const hostOnly = `claude-host-${process.pid}`
  const childOnly = `claude-child-${process.pid}`
  process.env[hostOnly] = 'must-not-leak'
  const controller = new AbortController()
  const child = ClaudeProcess.start({
    command: process.execPath,
    args: ['-e', "process.stdout.write(JSON.stringify({host:process.env[process.argv[1]], child:process.env[process.argv[2]]})+'\\n'); process.stdin.on('data', c => process.stdout.write(c))", hostOnly, childOnly],
    env: { [childOnly]: 'present', PATH: process.env['PATH'] },
    signal: controller.signal,
  })
  const lines = new LineReader(child.stdout)
  try {
    assert.equal(await lines.next(), JSON.stringify({ child: 'present' }))
    child.stdin.write('first\n')
    child.stdin.write('second\n')
    assert.equal((await lines.next()).trim(), 'first')
    assert.equal((await lines.next()).trim(), 'second')
  } finally {
    delete process.env[hostOnly]
    await child.close()
  }
})

test('ClaudeProcess redacts stderr and streams at least 10k chunks before close', async () => {
  const count = 10_000
  const secret = 'claude-process-secret'
  const child = ClaudeProcess.start({
    command: process.execPath,
    args: ['-e', `process.stderr.write(${JSON.stringify(`diagnostic ${secret}`)}); for (let i=0; i<${count}; i++) process.stdout.write('chunk-'+i+'\\n'); process.stdout.end()`],
    env: { PATH: process.env['PATH'] },
    signal: new AbortController().signal,
    redactions: [secret],
  })
  let first = false
  let received = 0
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    received += lines.filter(line => line.length > 0).length
    if (received > 0) first = true
  })
  await child.exited
  assert.equal(first, true)
  assert.equal(received, count)
  assert.equal(child.stderrTail, 'diagnostic [REDACTED]')
  assert.equal(child.signalCode, null)
  assert.equal(child.exitCode, 0)
})

test('ClaudeProcess abort kills the detached process tree and normalizes signalCode', async () => {
  const controller = new AbortController()
  const child = ClaudeProcess.start({
    command: process.execPath,
    args: ['-e', "const {spawn}=require('node:child_process'); const grandchild=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); process.stdout.write(String(grandchild.pid)+'\\n'); setInterval(()=>{},1000)"],
    env: { PATH: process.env['PATH'] },
    signal: controller.signal,
  })
  const lines = new LineReader(child.stdout)
  const grandchildPid = Number.parseInt(await lines.next(), 10)
  assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0)
  controller.abort()
  const exit = await child.exited
  assert.equal(exit.signal, 'SIGTERM')
  assert.equal(child.signalCode, 'SIGTERM')
  await processIsGone(grandchildPid)
})

test('ClaudeProcess close is idempotent and redacts spawn errors', async () => {
  const closeChild = ClaudeProcess.start({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    env: { PATH: process.env['PATH'] },
    signal: new AbortController().signal,
  })
  const firstClose = await closeChild.close(100)
  const secondClose = await closeChild.close(100)
  assert.equal(firstClose.signal, 'SIGTERM')
  assert.deepEqual(secondClose, firstClose)

  const secret = 'claude-spawn-error-secret'
  const failed = ClaudeProcess.start({
    command: `/tmp/${secret}`,
    args: [],
    env: {},
    signal: new AbortController().signal,
    redactions: [secret],
  })
  const exit = await failed.exited
  assert.equal(exit.error?.message.includes(secret), false)
})

function processIsGone(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = (): void => {
      try {
        process.kill(pid, 0)
        if (Date.now() - started > 2_000) { reject(new Error('process still running')); return }
        setTimeout(poll, 10)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') resolve()
        else reject(error)
      }
    }
    poll()
  })
}
