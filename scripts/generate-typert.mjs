import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '../../deepseek-harness/packages/typert/generator/src/index.ts'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = resolve(packageRoot, '../deepseek-harness')
const tempRoot = await mkdtemp(join(tmpdir(), 'dsh-engine-suite-typert-'))
const tempPackage = join(tempRoot, 'packages/engine-suite')
const tempProtocol = join(tempRoot, 'packages/typert-protocol')

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
      && !source.endsWith('/dist'),
  })
  await symlink(join(packageRoot, 'node_modules'), join(tempPackage, 'node_modules'), 'dir')
  await cp(join(harnessRoot, 'packages/typert/protocol'), tempProtocol, {
    recursive: true,
    filter: source => !source.includes('/lib/')
      && !source.endsWith('/lib')
      && !source.includes('/tests/')
      && !source.endsWith('/tests')
      && !source.endsWith('.tsbuildinfo'),
  })
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
      baseUrl: '.',
      paths: { '@deepseek-ai/dsh-typert-protocol': ['packages/typert-protocol/src/index.ts'] },
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
