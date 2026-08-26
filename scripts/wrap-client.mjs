import { readFile, writeFile } from 'node:fs/promises'

const body = (await readFile('dist/client-bundle/client.cjs', 'utf8')).replace(/\n?\/\/# sourceMappingURL=.*$/u, '')
const wrapped = `window.__ModuleLoader__.load({
  id: "@wolffycode/dsh-engine-suite",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body.split('\n').map(line => line.replace(/[ \t]+$/u, '')).join('\n')}
    return module.exports;
  },
});
`
await writeFile('lib/client.js', wrapped)
