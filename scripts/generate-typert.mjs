import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const protocolFixture = join(packageRoot, 'scripts/typert-protocol')
const tempRoot = await mkdtemp(join(tmpdir(), 'dsh-engine-suite-typert-'))
const tempPackage = join(tempRoot, 'packages/engine-suite')
const tempProtocol = join(tempRoot, 'packages/typert-protocol')
const packageNodeModules = join(packageRoot, 'node_modules')

async function packageTypePaths(scope) {
  const directory = join(packageNodeModules, scope)
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = {}
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const specifier = `${scope}/${entry.name}`
    const manifestPath = join(directory, entry.name, 'package.json')
    let manifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch {
      continue
    }
    const typeTarget = typeof manifest.types === 'string' ? manifest.types : manifest.typings
    if (typeof typeTarget === 'string') paths[specifier] = [join(directory, entry.name, typeTarget)]
  }
  return paths
}

const dependencyPaths = {
  ...(await packageTypePaths('@deepseek-ai')),
  ...(await packageTypePaths('@anthropic-ai')),
}
const zodManifest = JSON.parse(await readFile(join(packageNodeModules, 'zod/package.json'), 'utf8'))
if (typeof zodManifest.types === 'string') dependencyPaths.zod = [join(packageNodeModules, 'zod', zodManifest.types)]

try {
  await mkdir(join(tempRoot, 'packages'), { recursive: true })
  await cp(packageRoot, tempPackage, {
    recursive: true,
    filter: source => !source.includes('/.git/')
      && !source.endsWith('/.git')
      && !source.includes('/node_modules/')
      && !source.endsWith('/node_modules')
      && !source.includes('/lib/')
      && !source.endsWith('/lib')
      && !source.includes('/dist/')
      && !source.endsWith('/dist')
      && !source.includes('/scripts/typert-protocol/')
      && !source.endsWith('/scripts/typert-protocol'),
  })
  await cp(protocolFixture, tempProtocol, { recursive: true })
  const packageTsconfig = JSON.parse(await readFile(join(packageRoot, 'tsconfig.json'), 'utf8'))
  packageTsconfig.extends = '../../tsconfig.base.json'
  packageTsconfig.compilerOptions = { ...packageTsconfig.compilerOptions, rootDir: 'src', outDir: 'lib' }
  await writeFile(join(tempPackage, 'tsconfig.json'), `${JSON.stringify(packageTsconfig, null, 2)}\n`)
  await writeFile(join(tempProtocol, 'tsconfig.json'), `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "lib" },
  "include": ["src/**/*.ts"]
}
`)
  await writeFile(join(tempRoot, 'tsconfig.base.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      declaration: true,
      jsx: 'react-jsx',
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: true,
      baseUrl: tempRoot,
      typeRoots: [`${packageNodeModules}/@types`],
      paths: {
        ...dependencyPaths,
        '@deepseek-ai/dsh-typert-protocol': ['packages/typert-protocol/src/index.ts'],
      },
    },
  }, null, 2) + '\n')
  await writeFile(join(tempRoot, 'tsconfig.host.json'), `{
  "extends": "./tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./packages/typert-protocol/tsconfig.json" },
    { "path": "./packages/engine-suite/tsconfig.host.json" }
  ]
}
`)
  await writeFile(join(tempRoot, 'tsconfig.client.json'), `{
  "extends": "./tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./packages/typert-protocol/tsconfig.json" },
    { "path": "./packages/engine-suite/tsconfig.client.json" }
  ]
}
`)

  const artifact = new WorkspaceTypertGenerator(tempRoot)
    .generate(['@wolffycode/dsh-engine-suite'], ['host'])[0]
  if (artifact === undefined || artifact.remote === undefined) {
    throw new Error('Engine Suite Host Remote artifact was not generated')
  }
  const output = join(packageRoot, 'lib')
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'typert.host.js'), artifact.js)
  await writeFile(join(output, 'typert.host.d.ts'), artifact.dts)
  await writeFile(join(output, 'typert.remote-client.js'), artifact.remote.js)
  await writeFile(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
  await writeFile(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  console.log(`generated Typert Host and Remote artifacts for ${artifact.package}`)
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
