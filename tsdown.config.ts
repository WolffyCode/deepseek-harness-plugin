import { defineConfig } from 'tsdown'

const requested = (specifier: string): boolean =>
  specifier.startsWith('@deepseek-ai/')
  || specifier === 'react'
  || specifier === 'react/jsx-runtime'

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist/client-bundle',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: true,
  sourcemap: true,
  deps: {
    neverBundle: requested,
    alwaysBundle: (specifier: string) => !requested(specifier),
  },
})
