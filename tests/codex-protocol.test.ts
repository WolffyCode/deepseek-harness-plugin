import assert from 'node:assert/strict'
import test from 'node:test'
import { PassThrough } from 'node:stream'
import { JsonRpcLineTransport } from '../src/codex/json-rpc.js'

async function nextLine(output: PassThrough): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let timer: NodeJS.Timeout | undefined
    const cleanup = (): void => {
      output.off('data', onData)
      output.off('error', onError)
      if (timer !== undefined) clearTimeout(timer)
    }
    const onData = (chunk: Buffer | string): void => {
      buffer += String(chunk)
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      cleanup()
      try {
        resolve(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>)
      } catch (error: unknown) {
        reject(error)
      }
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    timer = setTimeout(() => {
      cleanup()
      reject(new Error('timed out waiting for JSON-RPC output'))
    }, 1000)
    output.on('data', onData)
    output.once('error', onError)
  })
}

function transport(): { readonly input: PassThrough, readonly output: PassThrough, readonly rpc: JsonRpcLineTransport } {
  const input = new PassThrough()
  const output = new PassThrough()
  const rpc = new JsonRpcLineTransport(input, output)
  rpc.start()
  return { input, output, rpc }
}

function cleanup(input: PassThrough, output: PassThrough, rpc: JsonRpcLineTransport): void {
  rpc.close()
  input.destroy()
  output.destroy()
}

test('malformed JSONL closes the transport with an explicit error and rejects pending requests', async () => {
  const { input, output, rpc } = transport()
  try {
    const pending = rpc.request('pending')
    await nextLine(output)

    input.write('{malformed\n')

    await assert.rejects(pending, /invalid JSON-RPC frame: malformed JSON/)
    await rpc.closedPromise
    await assert.rejects(rpc.request('after-close'), /invalid JSON-RPC frame: malformed JSON/)
  } finally {
    cleanup(input, output, rpc)
  }
})

test('unknown response ids are explicit protocol errors and close the transport', async () => {
  const { input, output, rpc } = transport()
  try {
    const pending = rpc.request('pending')
    await nextLine(output)

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 999, result: null }) + '\n')

    await assert.rejects(pending, /unknown JSON-RPC response id/)
    await rpc.closedPromise
    await assert.rejects(rpc.request('after-close'), /unknown JSON-RPC response id/)
  } finally {
    cleanup(input, output, rpc)
  }
})

test('JSON-RPC error responses reject the matching request without closing the transport', async () => {
  const { input, output, rpc } = transport()
  try {
    const pending = rpc.request('fails')
    const request = await nextLine(output)

    input.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request['id'],
      error: { code: -32001, message: 'upstream failed', data: { retryable: true } },
    }) + '\n')

    await assert.rejects(pending, /JSON-RPC -32001: upstream failed/)
    const next = rpc.request('still-open')
    const nextRequest = await nextLine(output)
    input.write(JSON.stringify({ jsonrpc: '2.0', id: nextRequest['id'], result: 'ok' }) + '\n')
    assert.equal(await next, 'ok')
  } finally {
    cleanup(input, output, rpc)
  }
})

test('request handler failures return JSON-RPC errors without leaking the thrown error', async () => {
  const { input, output, rpc } = transport()
  try {
    rpc.onRequest(() => {
      throw new Error('secret-api-key')
    })

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'needs-approval' }) + '\n')
    const response = await nextLine(output)

    assert.deepEqual(response['error'], {
      code: -32000,
      message: 'JSON-RPC request handler failed',
    })
    assert.doesNotMatch(JSON.stringify(response), /secret-api-key/)
  } finally {
    cleanup(input, output, rpc)
  }
})

test('unknown server requests return a JSON-RPC method-not-found error', async () => {
  const { input, output, rpc } = transport()
  try {
    input.write(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'unknown/method' }) + '\n')
    const response = await nextLine(output)
    const error = response['error'] as Record<string, unknown> | undefined

    assert.equal(error?.['code'], -32601)
    assert.equal('result' in response, false)
  } finally {
    cleanup(input, output, rpc)
  }
})

test('close is idempotent, rejects all pending requests, and abort removes only its request', async () => {
  const { input, output, rpc } = transport()
  try {
    const controller = new AbortController()
    const aborted = rpc.request('aborted', undefined, controller.signal)
    const retained = rpc.request('retained')
    await nextLine(output)

    controller.abort(new Error('cancelled'))
    await assert.rejects(aborted, /cancelled/)

    rpc.close(new Error('shutdown'))
    rpc.close(new Error('different error'))
    await assert.rejects(retained, /shutdown/)
    await rpc.closedPromise
    await assert.rejects(rpc.notify('after-close'), /shutdown/)
  } finally {
    cleanup(input, output, rpc)
  }
})
