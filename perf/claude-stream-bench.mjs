#!/usr/bin/env node

const chunks = Number.parseInt(process.env.CLAUDE_BENCH_CHUNKS ?? '10000', 10)
if (!Number.isSafeInteger(chunks) || chunks <= 0) {
  throw new Error('CLAUDE_BENCH_CHUNKS must be a positive safe integer')
}

async function* fakeClaudeSdkStream(total) {
  for (let index = 0; index < total; index += 1) {
    yield { sequence: index, text: `chunk-${String(index).padStart(5, '0')}` }
  }
}

const started = performance.now()
let received = 0
let lost = 0
let outOfOrder = 0
let previous = -1
let first
let last
for await (const event of fakeClaudeSdkStream(chunks)) {
  if (event.sequence !== previous + 1) {
    outOfOrder += 1
    if (event.sequence > previous + 1) lost += event.sequence - previous - 1
  }
  previous = event.sequence
  first ??= event
  last = event
  received += 1
}
const elapsed = performance.now() - started
const throughput = elapsed === 0 ? received : received / (elapsed / 1000)
if (received !== chunks) lost += chunks - received

const result = {
  chunks,
  elapsed,
  throughput,
  received,
  lost,
  outOfOrder,
  first,
  last,
}
console.log(JSON.stringify(result))
if (lost !== 0 || outOfOrder !== 0 || received !== chunks) process.exitCode = 1
