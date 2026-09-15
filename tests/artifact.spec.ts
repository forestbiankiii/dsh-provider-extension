import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const clientSource = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')

describe('published artifact contract', () => {
  it('advertises one installable bundle and client entry', () => {
    expect(manifest.name).toBe('dsh-model-panel')
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.exports['./client'].default).toBe('./lib/client.js')
    expect(patch).toContain("name: 'dsh-model-panel'")
  })

  it('replaces the shipped model seat instead of adding a duplicate right-side control', () => {
    expect(clientSource).toContain("ctx.slots.inject('conversation.input.model'")
    expect(clientSource).toContain('priority: -20')
    expect(clientSource).not.toContain("ctx.slots.inject('conversation.input.right'")
  })

  it('ships the expected DSH module-loader wrapper without dshx internals', () => {
    expect(client.startsWith('window.__ModuleLoader__.load({id:"dsh-model-panel"')).toBe(true)
    expect(client).not.toContain('@dshx/')
    const requires = [...client.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]).sort()
    expect(requires).toEqual(['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime'])
  })
})
