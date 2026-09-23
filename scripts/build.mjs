import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
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
    // Resolve every CSS module to a normalized relative path from the project
    // root so each file keeps a distinct class-name hash without baking host
    // absolute paths into the committed bundle and source maps.
    buildApi.onResolve({ filter: /\.module\.css$/ }, args => {
      const absolutePath = resolve(args.resolveDir, args.path)
      const relativePath = relative(root, absolutePath).replaceAll('\\', '/')
      return {
        path: relativePath,
        namespace: 'dsh-provider-extension-css',
        pluginData: { absolutePath },
      }
    })
    buildApi.onLoad({ filter: /.*/, namespace: 'dsh-provider-extension-css' }, async args => {
      const source = await readFile(args.pluginData.absolutePath)
      const result = transform({
        filename: basename(args.path),
        code: source,
        minify: true,
        cssModules: { pattern: 'dpe_[local]_[hash]' },
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
  external: [
    '@cortexkit/*',
    '@deepseek-ai/*',
    '@earendil-works/*',
    'https-proxy-agent',
    'agent-base',
  ],
  logLevel: 'info',
})

const id = 'dsh-provider-extension'
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

console.log('Built dsh-provider-extension host, client, CSS, source maps, and declarations.')
