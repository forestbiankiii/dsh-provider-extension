// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { codexEnabledModels, saveCodexEnabledModels } from '../src/client/codex-visibility.ts'
import { ACCOUNT_DISABLED_MODELS_STORAGE_KEY } from '../src/client/selection.ts'

afterEach(() => localStorage.clear())
describe('Codex account model visibility', () => {
  it('migrates the old fixed-list exclusions without enabling unlisted fallback models', () => {
    localStorage.setItem(ACCOUNT_DISABLED_MODELS_STORAGE_KEY, JSON.stringify({ work: [
      'gpt-reserve', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'codex-auto-review',
    ] }))
    expect([...codexEnabledModels('work')!]).toEqual(['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'])
    expect(codexEnabledModels('work')!.has('gpt-5.4')).toBe(false)
    expect(codexEnabledModels('gmail')).toBeUndefined()
  })
  it('keeps an explicit empty selection and isolates accounts sharing no identity', () => {
    saveCodexEnabledModels('work', 'work@example.com', new Set(['gpt-6-sol']))
    saveCodexEnabledModels('gmail', 'gmail@example.com', new Set())
    expect([...codexEnabledModels('work')!]).toEqual(['gpt-6-sol'])
    expect([...codexEnabledModels('gmail')!]).toEqual([])
    expect([...codexEnabledModels('new-local-id', 'work@example.com')!]).toEqual(['gpt-6-sol'])
  })
})
