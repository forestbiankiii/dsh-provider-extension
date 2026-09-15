import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const required = [
  'LICENSE', 'README.md', 'README.zh-CN.md', 'SECURITY.md', 'CHANGELOG.md',
  'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/types/index.d.ts',
  'scripts/profile.mjs',
]
for (const path of required) await stat(resolve(root, path))

const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
if (manifest.private === true) throw new Error('package.json must not be private')
if (manifest.name !== 'dsh-provider-extension') throw new Error('Unexpected package name')
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('Missing DSH bundle patch')

const publicArtifacts = await Promise.all([
  'package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js',
  'lib/types/index.d.ts', 'lib/types/client/index.d.ts', 'lib/types/client/ProviderPanel.d.ts',
].map(async path => [path, await readFile(resolve(root, path), 'utf8')]))
for (const [path, content] of publicArtifacts) {
  for (const forbidden of ['workspace:', 'catalog:', '@dshx/', 'C:\\dshx', 'C:/dshx']) {
    if (content.includes(forbidden)) throw new Error(`${path} contains forbidden standalone reference: ${forbidden}`)
  }
}

const client = await readFile(resolve(root, 'lib/client.js'), 'utf8')
if (!client.startsWith('window.__ModuleLoader__.load({id:"dsh-provider-extension"')) {
  throw new Error('Client artifact is not wrapped for the DSH module loader')
}
const requires = [...client.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]).sort()
const expected = ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime']
if (JSON.stringify(requires) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected runtime requires: ${requires.join(', ')}`)
}
console.log('Standalone package verification passed.')
