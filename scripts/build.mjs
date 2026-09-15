import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { transform } from 'lightningcss'

const root = resolve(import.meta.dirname, '..')
const lib = resolve(root, 'lib')
await rm(lib, { recursive: true, force: true })
await mkdir(lib, { recursive: true })

execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
})

const cssModules = {
  name: 'standalone-css-modules',
  setup(buildApi) {
    buildApi.onResolve({ filter: /\.module\.css$/ }, args => ({
      path: 'ModelPanel.module.css',
      namespace: 'dsh-model-panel-css',
      pluginData: { absolutePath: resolve(args.resolveDir, args.path) },
    }))
    buildApi.onLoad({ filter: /.*/, namespace: 'dsh-model-panel-css' }, async args => {
      const source = await readFile(args.pluginData.absolutePath)
      const result = transform({
        filename: 'ModelPanel.module.css',
        code: source,
        minify: true,
        cssModules: { pattern: 'dmp_[local]_[hash]' },
      })
      const classes = Object.fromEntries(
        Object.entries(result.exports ?? {})
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([local, value]) => [local, value.name]),
      )
      return {
        loader: 'js',
        contents: `export const cssText=${JSON.stringify(result.code.toString())};export default ${JSON.stringify(classes)};`,
      }
    })
  },
}

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
})

const id = 'dsh-model-panel'
await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  charset: 'utf8',
  sourcemap: true,
  sourcesContent: true,
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-store',
  ],
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(id)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
  footer: { js: ';return module.exports;}});' },
  plugins: [cssModules],
  logLevel: 'info',
})

console.log('Built dsh-model-panel host, client, CSS, source maps, and declarations.')
