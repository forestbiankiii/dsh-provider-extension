import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const region = source.split('//#region src/image-tool-prompt.js\n')[1]!.split('//#endregion')[0]!
const { installCodexImagePolicy } = new Function('PROVIDER', `${region}\nreturn { installCodexImagePolicy }`)('openai-codex')
function fixture(imageGeneration = true, imageEditing = true) {
  const listeners = new Map<string, (...args: any[]) => unknown>()
  const guards: Array<(execution: any) => string | undefined> = []
  const ctx = {
    get: (key: string) => key === 'systemPrompt' ? {} : undefined,
    on: vi.fn((event: string, listener: (...args: any[]) => unknown) => { listeners.set(event, listener); return () => listeners.delete(event) }),
    tools: { guard: vi.fn((guard: (execution: any) => string | undefined) => { guards.push(guard); return () => { guards.splice(guards.indexOf(guard), 1) } }) },
  }
  const features = { current: () => ({ imageGeneration, imageEditing }) }
  const dispose = installCodexImagePolicy(ctx, features)
  return { listeners, guards, ctx, dispose }
}
async function assembly(f: ReturnType<typeof fixture>, provider: string) {
  const input = { sections: [{ name: 'existing', text: 'keep' }], contexts: [], tools: [], variables: {} }
  const handler = f.listeners.get('system-prompt/assemble')!
  return await handler(input, {}, async () => ({ ...input, variables: { provider } })) as { sections: Array<{ name: string; text: string }>; variables: Record<string, string> }
}
describe('Codex-only image request routing instruction', () => {
  it('adds the explicit image-tool rule only when the assembled route is Codex', async () => {
    const f = fixture()
    const other = await assembly(f, 'deepseek-official')
    expect(other.sections).toEqual([{ name: 'existing', text: 'keep' }])
    const codex = await assembly(f, 'openai-codex-account')
    const rule = codex.sections.find(section => section.name === 'codex-subscription-image-routing')
    expect(rule?.text).toContain('For explicit image-generation or image-edit requests')
    expect(rule?.text).toContain('codex_image_generate')
    expect(rule?.text).toContain('Do not call the image tool for image discussion or prompt-writing alone')
    expect(codex.variables.provider).toBe('openai-codex-account')
    const guard = f.guards[0]!
    expect(guard({ name: 'generate_image', agent: { session: { requestHeader: () => ({ config: { provider: 'openai-codex-account' } }) } } })).toContain('must use the Codex image tool')
    expect(guard({ name: 'generate_image', agent: { session: { requestHeader: () => ({ config: { provider: 'deepseek-official' } }) } } })).toBeUndefined()
    expect(guard({ name: 'codex_image_generate', agent: { session: { requestHeader: () => ({ config: { provider: 'openai-codex' } }) } } })).toBeUndefined()
    f.dispose()
    expect(f.listeners.size).toBe(0); expect(f.guards).toHaveLength(0)
  })
  it('honors disabled generation and editing switches without fallback instructions', async () => {
    const generationOff = fixture(false, true)
    const generation = await assembly(generationOff, 'openai-codex')
    const text = generation.sections.find(section => section.name === 'codex-subscription-image-routing')!.text
    expect(text).toContain('Image generation is disabled')
    expect(text).not.toContain('Call `codex_image_generate` for image creation.')
    expect(text).toContain('Call `codex_image_generate` for edits')
    const bothOff = fixture(false, false)
    const disabled = await assembly(bothOff, 'openai-codex')
    const disabledText = disabled.sections.find(section => section.name === 'codex-subscription-image-routing')!.text
    expect(disabledText).toContain('Image generation is disabled')
    expect(disabledText).toContain('Image editing is disabled')
  })
})
