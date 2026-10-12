import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = source.split('//#region src/image-tool-prompt.js\n')[1]!.split('//#endregion')[0]!
const { installCodexImagePolicy } = new Function('PROVIDER', `${region}\nreturn { installCodexImagePolicy }`)('openai-codex')
function fixture(imageGeneration = true, imageEditing = true) {
  const listeners = new Map<string, (...args: any[]) => unknown>()
  const guards: Array<(execution: any) => string | undefined> = []
  const sections = new Map<string, { readonly text: () => string }>()
  const systemPrompt = {
    getSectionOrder: vi.fn(() => 5000),
    section: vi.fn((section: { readonly name: string; readonly order: number; readonly text: () => string }) => {
      sections.set(section.name, section)
      return vi.fn(() => sections.delete(section.name))
    }),
  }
  const ctx = {
    on: vi.fn((event: string, listener: (...args: any[]) => unknown) => { listeners.set(event, listener); return () => listeners.delete(event) }),
    tools: { guard: vi.fn((guard: (execution: any) => string | undefined) => { guards.push(guard); return () => { guards.splice(guards.indexOf(guard), 1) } }) },
  }
  const features = { current: () => ({ imageGeneration, imageEditing }) }
  const dispose = installCodexImagePolicy(ctx, features)
  const agent = (provider: string) => ({
    id: `session-${provider}`,
    options: { provider },
    session: { requestHeader: () => ({ config: { provider } }) },
    ctx: { get: (key: string) => key === 'systemPrompt' ? systemPrompt : undefined, effect: (effect: () => () => void) => effect() },
  })
  return { listeners, guards, sections, systemPrompt, dispose, agent }
}
describe('Codex-only image request routing instruction', () => {
  it('adds a scoped prompt section only to Codex Agents and follows later route changes', async () => {
    const f = fixture()
    const codex = f.agent('openai-codex-account')
    const created = f.listeners.get('agent/created')!
    created({ agent: codex })
    const section = f.sections.get('codex-subscription-image-routing')!
    expect(section.text()).toContain('explicitly requested image generation or editing')
    expect(section.text()).toContain('codex_image_generate')
    expect(section.text()).toContain('numbered annotations, include both the clean source and location-reference image')
    expect(section.text()).toContain('Do not call the image tool for image discussion')
    const request = f.listeners.get('agent/request')! as (payload: { agent: ReturnType<typeof f.agent> }, next: () => Promise<{ provider: string; model: string }>) => Promise<unknown>
    await request({ agent: codex }, async () => ({ provider: 'deepseek-official', model: 'chat' }))
    expect(f.sections.has('codex-subscription-image-routing')).toBe(false)
    await request({ agent: codex }, async () => ({ provider: 'openai-codex', model: 'gpt' }))
    expect(f.sections.get('codex-subscription-image-routing')?.text()).toContain('codex_image_generate')
    const disposed = f.listeners.get('agent/disposed')!
    disposed({ agent: codex })
    expect(f.sections.has('codex-subscription-image-routing')).toBe(false)
    const other = f.agent('deepseek-official')
    created({ agent: other })
    expect(f.sections.has('codex-subscription-image-routing')).toBe(false)
    f.dispose()
    expect(f.listeners.size).toBe(0); expect(f.guards).toHaveLength(0)
  })
  it('honors disabled generation and editing switches', () => {
    const generationOff = fixture(false, true)
    const codex = generationOff.agent('openai-codex')
    generationOff.listeners.get('agent/created')!({ agent: codex })
    const text = generationOff.sections.get('codex-subscription-image-routing')!.text()
    expect(text).toContain('Image generation is disabled')
    expect(text).not.toContain('Call `codex_image_generate` for image creation.')
    expect(text).toContain('Call the tool for edits')
    const bothOff = fixture(false, false)
    const disabledAgent = bothOff.agent('openai-codex')
    bothOff.listeners.get('agent/created')!({ agent: disabledAgent })
    const disabledText = bothOff.sections.get('codex-subscription-image-routing')!.text()
    expect(disabledText).toContain('Image generation is disabled')
    expect(disabledText).toContain('Image editing is disabled')
  })
  it('blocks other image-provider fallback only for Codex-routed executions', () => {
    const f = fixture()
    const guard = f.guards[0]!
    expect(guard({ name: 'generate_image', agent: { session: { requestHeader: () => ({ config: { provider: 'openai-codex-account' } }) } } })).toContain('must use the Codex image tool')
    expect(guard({ name: 'generate_image', agent: { session: { requestHeader: () => ({ config: { provider: 'deepseek-official' } }) } } })).toBeUndefined()
    expect(guard({ name: 'codex_image_generate', agent: { session: { requestHeader: () => ({ config: { provider: 'openai-codex' } }) } } })).toBeUndefined()
    f.dispose()
  })
})
