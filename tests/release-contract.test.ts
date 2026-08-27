import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

async function text(path: string): Promise<string> {
  return readFile(join(packageRoot, path), 'utf8')
}

async function mustExist(path: string): Promise<void> {
  await access(join(packageRoot, path))
}

test('release package exports every host, remote, client, and declaration artifact', async () => {
  const manifest = JSON.parse(await text('package.json')) as {
    readonly exports: Record<string, unknown>
    readonly files: readonly string[]
    readonly dsh: { readonly client: { readonly inject: readonly string[] } }
    readonly devDependencies: Record<string, string>
    readonly peerDependencies: Record<string, string>
    readonly packageManager: string
  }
  const requiredExports = {
    '.': 'lib/index.js',
    './client': 'lib/client.js',
    './typert': 'lib/typert.host.js',
    './remote': 'lib/typert.remote-client.js',
    './types': 'lib/types.js',
  }
  for (const [subpath, target] of Object.entries(requiredExports)) {
    const entry = manifest.exports[subpath]
    assert.ok(entry !== null && typeof entry === 'object', `${subpath} export is missing`)
    assert.equal((entry as { readonly default: string }).default, `./${target}`)
    await mustExist(target)
  }
  for (const declaration of [
    'lib/index.d.ts',
    'lib/types.d.ts',
    'lib/types/client/index.d.ts',
    'lib/typert.host.d.ts',
    'lib/typert.remote-client.d.ts',
  ]) await mustExist(declaration)
  assert.ok(manifest.files.includes('lib/**/*.js'))
  assert.ok(manifest.files.includes('lib/**/*.d.ts'))
  assert.ok(manifest.files.includes('cordis.patch.yml'))
  assert.equal(manifest.packageManager, 'pnpm@11.11.0')
  for (const injected of manifest.dsh.client.inject) {
    assert.ok(
      manifest.peerDependencies[injected] !== undefined,
      `client injection ${injected} must be declared as a peer dependency`,
    )
    assert.ok(manifest.devDependencies[injected] !== undefined, `client injection ${injected} must be installed for local verification`)
  }
})

test('release build is independent from the parent Harness checkout and symlinked dependencies', async () => {
  const generator = await text('scripts/generate-typert.mjs')
  assert.doesNotMatch(generator, /deepseek-harness/u)
  assert.doesNotMatch(generator, /symlink/u)
  for (const path of [
    'scripts/typert-protocol/package.json',
    'scripts/typert-protocol/tsconfig.json',
    'scripts/typert-protocol/src/index.ts',
    'scripts/typert-protocol/src/types.ts',
  ]) await mustExist(path)
  const workspace = await text('pnpm-workspace.yaml')
  assert.match(workspace, /autoInstallPeers:\s*false/u)
  assert.match(workspace, /allowBuilds:\s*\n\s+esbuild:\s*true/u)
})
