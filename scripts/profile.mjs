import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = 'dsh-provider-extension'
/**
 * Every package name an earlier install may have used. All of them are removed
 * from the profile before the current package is registered, so a rename never
 * leaves a second bundle row behind.
 */
const LEGACY_PACKAGES = ['dsh-model-panel', '@dshx/client-ui-model-panel', '@dshx/client-ui-provider-extension']
const LEGACY_ROW_IDS = '(?:ui-model-panel|model-panel|ui-provider-extension|provider-extension)'
const LEGACY_NAMES = '(?:@dshx\\/client-ui-model-panel|dsh-model-panel|@dshx\\/client-ui-provider-extension|dsh-provider-extension)'
const ROW_PATTERN = new RegExp(
  `(?:^|\\r?\\n)- insert:\\r?\\n {4}- id: ${LEGACY_ROW_IDS}\\r?\\n {6}name: ['"]${LEGACY_NAMES}['"]\\r?\\n?`,
  'g',
)
const MARKER_PATTERN = /(?:^|\r?\n)# >>> (?:dsh-model-panel|dsh-provider-extension) >>>[\s\S]*?# <<< (?:dsh-model-panel|dsh-provider-extension) <<<\r?\n?/g

function parseArgs(argv) {
  const [action = 'help', ...rest] = argv
  const options = { action, profile: 'desktop', dshHome: process.env.DSH_HOME || join(homedir(), '.dsh') }
  for (let i = 0; i < rest.length; i++) {
    const value = rest[i]
    if (value === '--profile') options.profile = rest[++i]
    else if (value === '--dsh-home') options.dshHome = rest[++i]
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (!options.profile || !options.dshHome) throw new Error('Profile and DSH home must not be empty.')
  return options
}

async function atomicWrite(path, content) {
  const temporary = `${path}.${PACKAGE}-${process.pid}.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, path)
}

async function copyPackage(sourceRoot, target) {
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  for (const path of ['package.json', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'SECURITY.md']) {
    const source = join(sourceRoot, path)
    if (existsSync(source)) await cp(source, join(target, path), { recursive: true })
  }
  await cp(join(sourceRoot, 'lib'), join(target, 'lib'), { recursive: true })
}

/** Drop every legacy runtime copy a previous name may have installed. */
async function removeLegacyCopies(home, profileDir) {
  const targets = [
    ...LEGACY_PACKAGES.flatMap(name => [
      name.startsWith('@')
        ? join(profileDir, 'node_modules', ...name.split('/'))
        : join(profileDir, 'node_modules', name),
      join(home, 'local-plugins', name.startsWith('@') ? name.split('/')[1] : name),
    ]),
  ]
  for (const target of targets) await rm(target, { recursive: true, force: true })
}

function removeRows(patch) {
  return patch.replace(MARKER_PATTERN, '\n').replace(ROW_PATTERN, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

export async function installProfile({ dshHome, profile = 'desktop', sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..') }) {
  const home = resolve(dshHome)
  const profileDir = join(home, 'profiles', profile)
  const manifestPath = join(profileDir, 'package.json')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(manifestPath) || !existsSync(patchPath)) {
    throw new Error(`DSH profile not found: ${profileDir}`)
  }
  if (!existsSync(join(sourceRoot, 'lib', 'client.js'))) {
    throw new Error('Prebuilt lib/client.js is missing. Run npm run build first.')
  }

  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const backupDir = join(profileDir, `.${PACKAGE}-backups`, stamp)
  await mkdir(backupDir, { recursive: true })
  await cp(manifestPath, join(backupDir, 'package.json'))
  await cp(patchPath, join(backupDir, 'cordis.patch.yml'))

  const localTarget = join(home, 'local-plugins', PACKAGE)
  const installedTarget = join(profileDir, 'node_modules', PACKAGE)
  await copyPackage(sourceRoot, localTarget)
  await copyPackage(sourceRoot, installedTarget)

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dependencies ??= {}
  for (const legacy of LEGACY_PACKAGES) delete manifest.dependencies[legacy]
  manifest.dependencies[PACKAGE] = `file:../../local-plugins/${PACKAGE}`
  manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort(([a], [b]) => a.localeCompare(b)))
  manifest.dsh ??= {}
  manifest.dsh.profile ??= {}
  if (manifest.dsh.profile.bundles !== undefined && !Array.isArray(manifest.dsh.profile.bundles)) {
    throw new Error('DSH profile bundles must be an array.')
  }
  manifest.dsh.profile.bundles = [
    ...(manifest.dsh.profile.bundles ?? []).filter(bundle => bundle !== PACKAGE && !LEGACY_PACKAGES.includes(bundle)),
    PACKAGE,
  ]
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  // The package is a bundle whose own cordis.patch.yml registers provider-extension.
  // Remove legacy/manual rows so a full restart never composes the same id twice.
  const patch = removeRows(await readFile(patchPath, 'utf8'))
  await atomicWrite(patchPath, `${patch}\n`)
  await removeLegacyCopies(home, profileDir)

  return { profileDir, localTarget, installedTarget, backupDir }
}

export async function uninstallProfile({ dshHome, profile = 'desktop' }) {
  const home = resolve(dshHome)
  const profileDir = join(home, 'profiles', profile)
  const manifestPath = join(profileDir, 'package.json')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(manifestPath) || !existsSync(patchPath)) {
    throw new Error(`DSH profile not found: ${profileDir}`)
  }

  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const backupDir = join(profileDir, `.${PACKAGE}-backups`, stamp)
  await mkdir(backupDir, { recursive: true })
  await cp(manifestPath, join(backupDir, 'package.json'))
  await cp(patchPath, join(backupDir, 'cordis.patch.yml'))

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.dependencies) {
    for (const legacy of LEGACY_PACKAGES) delete manifest.dependencies[legacy]
    delete manifest.dependencies[PACKAGE]
    manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort(([a], [b]) => a.localeCompare(b)))
  }
  if (Array.isArray(manifest.dsh?.profile?.bundles)) {
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(
      bundle => bundle !== PACKAGE && !LEGACY_PACKAGES.includes(bundle),
    )
  }
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await atomicWrite(patchPath, `${removeRows(await readFile(patchPath, 'utf8'))}\n`)
  await rm(installedTarget(profileDir), { recursive: true, force: true })
  await rm(join(home, 'local-plugins', PACKAGE), { recursive: true, force: true })
  return { profileDir, backupDir }
}

function installedTarget(profileDir) {
  return join(profileDir, 'node_modules', PACKAGE)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.action === 'help' || !['install', 'uninstall'].includes(options.action)) {
    console.log('Usage: node scripts/profile.mjs <install|uninstall> [--profile desktop] [--dsh-home PATH]')
    process.exitCode = options.action === 'help' ? 0 : 1
    return
  }
  const result = options.action === 'install'
    ? await installProfile(options)
    : await uninstallProfile(options)
  console.log(`${PACKAGE} ${options.action === 'install' ? 'installed into' : 'removed from'} ${result.profileDir}`)
  console.log(`Backup: ${result.backupDir}`)
  console.log('Fully restart DSH Desktop to rebuild the client module graph.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
