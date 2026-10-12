import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const clientSource = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')

describe('published artifact contract', () => {
  it('ships themed shared dropdowns and a single global K context input', () => {
    expect(client).toContain('codexContextSize')
    expect(client).toContain('contextLengthK')
    expect(client).toContain('settingMenu')
    expect(client).toContain('codexContextCapacities')
    expect(client).not.toContain('Draft Model')
  })
  it('ships the confirmed Standard/Fast preference and its deferred shared-operation tool', () => {
    const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
    expect(host).toContain('codexSpeedMode')
    expect(host).toContain('codex_speed_mode')
    expect(client).toContain('codexSpeedStandard')
    expect(client).toContain('codexSpeedFast')
    expect(client).not.toContain('codexSpeedUltrafast')
  })
  it('ships management tabs instead of the superseded two-column layout', () => {
    expect(client).toContain('管理账号')
    expect(client).toContain('管理设置')
    expect(client).toContain('tabpanel')
    expect(client).not.toContain('codexColumns')
  })
  it('ships context capacity with the approved settings and deferred tool, without image-precision controls', () => {
    const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
    expect(host).toContain('codexContextLength')
    expect(host).toContain('codex_context_length')
    expect(client).toContain('codexContextExtended')
    expect(client).toContain('codexContextSave')
    expect(client).toContain('settingMenu')
    expect(client).not.toContain('Draft Model')
    expect(client).not.toContain('codexContextRange')
    expect(client).not.toContain('codexImageFidelity')
  })
  it('ships the approved response detail field, deferred tool and four-choice control', () => {
    const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
    expect(host).toContain('codexOutputVerbosity')
    expect(host).toContain('codex_output_verbosity')
    expect(client).toContain('codexVerbosityHigh')
    expect(client).toContain('codex-subscription/preferences/update')
  })
  it('does not ship the rejected custom default-model UI, endpoint or Agent tool', () => {
    const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
    expect(host).not.toContain('codex_default_model')
    expect(host).not.toContain('provider-extension/default-model')
    expect(client).not.toContain('provider-extension/default-model')
    expect(client).not.toContain('defaultModelSetAria')
  })
  it('ships a Claude schema-only bridge alongside the host bundle, without a second token collector', () => {
    const bridge = readFileSync(new URL('../lib/claude-bridge.mjs', import.meta.url), 'utf8')
    const host = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
    expect(host).toContain('anthropic-claude-cli')
    expect(host).toContain('claude-bridge.mjs')
    expect(bridge).toContain('tools/list')
    expect(bridge).toContain('This call was handed to the harness')
    expect(bridge).not.toContain('child_process')
    expect(client).toContain('claude-subscription/')
    expect(client).toContain('opencodeCatalogUnavailable')
  })
  it('advertises one installable bundle and client entry', () => {
    expect(manifest.name).toBe('dsh-provider-extension')
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.exports['./client'].default).toBe('./lib/client.js')
    expect(patch).toContain("name: 'dsh-provider-extension'")
  })

  it('replaces the shipped model seat instead of adding a duplicate right-side control', () => {
    expect(clientSource).toContain("ctx.slots.inject('conversation.input.model'")
    expect(clientSource).toContain('priority: -20')
    expect(clientSource).not.toContain("ctx.slots.inject('conversation.input.right'")
  })

  it('keeps heatmap cells fixed-size while their grid spans the available width', () => {
    const cell = client.match(/\.dpe_heatCell_[\w-]+\{([^}]+)\}/)?.[1]
    const grid = client.match(/\.dpe_heatmap_[^{]+\{([^}]+)\}/)?.[1]
    const viewport = client.match(/\.dpe_heatScroll_[^{]+\{([^}]+)\}/)?.[1]
    expect(cell).toContain('width:20px')
    expect(cell).toContain('height:20px')
    expect(grid).toContain('width:100%')
    expect(grid).toContain('justify-content:space-between')
    expect(viewport).not.toContain('max-width')
  })
  it('keeps data-level heatmap fills unchanged on hover instead of inheriting the ordinary button fill', () => {
    const css = readFileSync(new URL('../src/client/usage/UsagePage.module.css', import.meta.url), 'utf8')
    expect(css).toContain('.page button:where(:not(.heatCell)):hover:not(:disabled)')
    expect(css).not.toMatch(/\.heatCell:hover\s*\{[^}]*background/)
    expect(css).toContain(".page .heatCell[data-active='true'] { outline:")
    expect(client).toMatch(/:where\(:not\(\.dpe_heatCell_[^)]+\)\)/)
  })
  it('themes the native filter picker without adding a custom dropdown runtime', () => {
    expect(client).toContain('appearance:base-select')
    expect(client).toContain('::picker(select)')
    expect(client).toContain('::checkmark')
    const picker = [...client.matchAll(/::picker\(select\)\{([^}]+)\}/g)].map(match => match[1]).find(rule => rule?.includes('background:'))
    expect(picker).toContain('background:var(--dsw-alias-bg-layer-1)')
    expect(picker).not.toContain('var(--dsw-alias-bg-overlay)')
    expect(picker).toContain('box-shadow:none')
  })
  it('ships theme-aware provider brand cards and matching native quota fills', () => {
    const css = readFileSync(new URL('../src/client/usage/UsagePage.module.css', import.meta.url), 'utf8')
    expect(css).toContain("[data-provider='deepseek'] { --account-brand: #4d6bfe;")
    expect(css).toContain("[data-provider='openai-codex'] { --account-brand: #10a37f;")
    expect(css).toContain("[data-provider='google-antigravity'] { --account-brand: #3186ff;")
    expect(css).toContain("[data-provider='opencode-go'] { --account-brand: var(--dsw-alias-label-primary);")
    expect(css).toContain('var(--account-brand) 8%, var(--dsw-alias-bg-layer-2)')
    // The brand stripe is clipped by the card's rounded silhouette instead of fighting its corners.
    const card = css.match(/\.accountBalanceCard \{([^}]+)\}/)?.[1] ?? ''
    const stripe = css.match(/\.accountBalanceCard::before \{([^}]+)\}/)?.[1] ?? ''
    expect(card).toContain('overflow: hidden')
    expect(stripe).not.toContain('border-radius')
    expect(css).toContain('var(--account-brand) 45%, var(--dsw-alias-label-primary)')
    // Information hierarchy: 15px card title, 14px quota values, 12px body/meta, 11px footnotes.
    expect(css).toContain('.accountBalanceCard h3 { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 650;')
    expect(css).toContain('.quotaHeading span { font-size: 12px;')
    expect(css).toContain('.balance strong { font-size: 24px;')
    expect(css).toContain('.accountBalanceCard > p.accountLabel { font-size: 13px;')
    expect(client).toContain('--account-stripe:linear-gradient(')
    expect(client).toContain('background:var(--account-brand)')
    expect(client).toContain('::-webkit-progress-value')
    expect(client).toContain('::-moz-progress-bar')
    const settingsCss = readFileSync(new URL('../src/client/ProviderSettings.module.css', import.meta.url), 'utf8')
    expect(settingsCss).toContain("[data-provider='claude'] { --provider-brand: #d97757;")
    expect(settingsCss).toContain("[data-provider='opencode'] { --provider-brand: var(--dsw-alias-label-primary);")
    expect(settingsCss).toContain('var(--provider-brand) 8%, var(--dsw-alias-bg-layer-1)')
    expect(client).toContain('data:image/svg+xml,')
    expect(client).not.toMatch(/data-provider[=:][^\n]*>AG<|>GPT<|>CL<|>OC</)
  })
  it('ships the expected DSH module-loader wrapper without dshx internals', () => {
    expect(client.startsWith('window.__ModuleLoader__.load({id:"dsh-provider-extension"')).toBe(true)
    expect(client).not.toContain('@dshx/')
    const requires = [...new Set([...client.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]))].sort()
    expect(requires).toEqual(['react', 'react/jsx-runtime'])
    expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-client-connection')
  })
})
