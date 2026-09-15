import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installProfile, uninstallProfile } from '../scripts/profile.mjs'

const root = resolve(import.meta.dirname, '..')
const fixture = resolve(root, 'temp', 'profile-test-home')
const profileDir = resolve(fixture, 'profiles', 'desktop')

afterEach(async () => { await rm(fixture, { recursive: true, force: true }) })

async function writeFixture() {
  await mkdir(resolve(profileDir, 'node_modules', 'dsh-model-panel'), { recursive: true })
  await mkdir(resolve(fixture, 'local-plugins', 'dsh-model-panel'), { recursive: true })
  await writeFile(resolve(profileDir, 'node_modules', 'dsh-model-panel', 'package.json'), '{"name":"dsh-model-panel"}')
  await writeFile(resolve(fixture, 'local-plugins', 'dsh-model-panel', 'package.json'), '{"name":"dsh-model-panel"}')
  await writeFile(resolve(profileDir, 'package.json'), `${JSON.stringify({
    name: 'fixture',
    private: true,
    dependencies: {
      other: '1.0.0',
      'dsh-model-panel': 'file:../../local-plugins/dsh-model-panel',
      '@dshx/client-ui-model-panel': 'file:legacy',
    },
    dsh: { profile: { bundles: ['base', 'dsh-model-panel', 'dsh-model-panel'] } },
  }, null, 2)}\n`)
  await writeFile(resolve(profileDir, 'cordis.patch.yml'),
    "# keep me\n- insert:\n    - id: model-panel\n      name: 'dsh-model-panel'\n")
}

describe('profile installer', () => {
  it('migrates a dsh-model-panel install to the renamed package without duplicating rows', async () => {
    await writeFixture()

    await installProfile({ dshHome: fixture, sourceRoot: root })
    await installProfile({ dshHome: fixture, sourceRoot: root })

    const manifest = JSON.parse(await readFile(resolve(profileDir, 'package.json'), 'utf8'))
    expect(manifest.dependencies.other).toBe('1.0.0')
    expect(manifest.dependencies['dsh-provider-extension']).toBe('file:../../local-plugins/dsh-provider-extension')
    expect(manifest.dependencies['dsh-model-panel']).toBeUndefined()
    expect(manifest.dependencies['@dshx/client-ui-model-panel']).toBeUndefined()
    expect(manifest.dsh.profile.bundles).toEqual(['base', 'dsh-provider-extension'])

    const patch = await readFile(resolve(profileDir, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('# keep me')
    expect(patch).not.toContain('model-panel')
    expect(patch).not.toContain('dsh-provider-extension')

    expect(await readFile(resolve(profileDir, 'node_modules', 'dsh-provider-extension', 'package.json'), 'utf8'))
      .toContain('dsh-provider-extension')
    expect(existsSync(resolve(profileDir, 'node_modules', 'dsh-model-panel'))).toBe(false)
    expect(existsSync(resolve(fixture, 'local-plugins', 'dsh-model-panel'))).toBe(false)

    await uninstallProfile({ dshHome: fixture })
    const after = JSON.parse(await readFile(resolve(profileDir, 'package.json'), 'utf8'))
    expect(after.dependencies).toEqual({ other: '1.0.0' })
    expect(after.dsh.profile.bundles).toEqual(['base'])
    expect(await readFile(resolve(profileDir, 'cordis.patch.yml'), 'utf8')).toContain('# keep me')
    expect(await readFile(resolve(profileDir, 'cordis.patch.yml'), 'utf8')).not.toContain('provider-extension')
  })
})
