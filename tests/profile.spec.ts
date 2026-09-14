import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installProfile, uninstallProfile } from '../scripts/profile.mjs'

const root = resolve(import.meta.dirname, '..')
const fixture = resolve(root, 'temp', 'profile-test-home')
const profileDir = resolve(fixture, 'profiles', 'desktop')

afterEach(async () => { await rm(fixture, { recursive: true, force: true }) })

describe('profile installer', () => {
  it('installs idempotently, backs up, and removes only its own state', async () => {
    await mkdir(profileDir, { recursive: true })
    await writeFile(resolve(profileDir, 'package.json'), `${JSON.stringify({
      name: 'fixture', private: true, dependencies: { other: '1.0.0', '@dshx/client-ui-model-panel': 'file:legacy' },
      dsh: { profile: { bundles: ['base'] } },
    }, null, 2)}\n`)
    await writeFile(resolve(profileDir, 'cordis.patch.yml'), "# keep me\n- insert:\n    - id: ui-model-panel\n      name: '@dshx/client-ui-model-panel'\n")

    await installProfile({ dshHome: fixture, sourceRoot: root })
    await installProfile({ dshHome: fixture, sourceRoot: root })

    const manifest = JSON.parse(await readFile(resolve(profileDir, 'package.json'), 'utf8'))
    expect(manifest.dependencies.other).toBe('1.0.0')
    expect(manifest.dependencies['dsh-model-panel']).toBe('file:../../local-plugins/dsh-model-panel')
    expect(manifest.dependencies['@dshx/client-ui-model-panel']).toBeUndefined()
    const patch = await readFile(resolve(profileDir, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('# keep me')
    expect(patch.match(/# >>> dsh-model-panel >>>/g)).toHaveLength(1)
    expect(patch).not.toContain('@dshx/client-ui-model-panel')
    expect(await readFile(resolve(profileDir, 'node_modules', 'dsh-model-panel', 'package.json'), 'utf8')).toContain('dsh-model-panel')

    await uninstallProfile({ dshHome: fixture })
    const after = JSON.parse(await readFile(resolve(profileDir, 'package.json'), 'utf8'))
    expect(after.dependencies).toEqual({ other: '1.0.0' })
    expect(await readFile(resolve(profileDir, 'cordis.patch.yml'), 'utf8')).toContain('# keep me')
    expect(await readFile(resolve(profileDir, 'cordis.patch.yml'), 'utf8')).not.toContain('dsh-model-panel')
  })
})
