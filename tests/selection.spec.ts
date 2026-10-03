import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { assertSelectionSucceeded, accentFor, effortIndex, isCurrentModel, resolveModelEffort, restingEffort, selectionForRow } from '../src/client/selection.ts'
const model = { id: 'gpt-5.6-sol', name: 'Sol', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' } }
describe('model selection policy', () => {
  it('uses the native panel surface and marks discrete slider tiers without changing hit targets', () => {
    const styles = readFileSync(new URL('../src/client/ProviderPanel.module.css', import.meta.url), 'utf8')
    expect(styles.match(/\.menu\s*\{([^}]+)\}/)?.[1]).toContain('background: var(--dsw-alias-bg-layer-2)')
    const stop = styles.match(/\.stop::before\s*\{([^}]+)\}/)?.[1]
    expect(stop).toContain('width: 6px')
    expect(stop).toContain('height: 6px')
    expect(stop).toContain('border-radius: 50%')
    expect(stop).toContain('background: var(--dsw-alias-border-l1)')
    expect(styles).not.toContain('.selectedMark')
    expect(styles).toContain('transform 200ms var(--dpe-spring)')
    expect(styles).toContain('.track:hover:not(:has(.input:disabled)) .thumb')
    expect(styles.match(/\.stop\s*\{([^}]+)\}/)?.[1]).toContain('pointer-events: none')
  })
  it('propagates resolved Result failures instead of pretending the switch succeeded', () => {
    expect(() => assertSelectionSucceeded({ ok: false, error: { code: 'session/writer-held', message: 'Session is in use' } })).toThrow('session/writer-held: Session is in use')
    expect(() => assertSelectionSucceeded({ ok: true, value: undefined })).not.toThrow()
    expect(() => assertSelectionSucceeded(undefined)).not.toThrow()
  })
  it.each([
    ['gpt-6-astra', 'color-mix(in srgb, var(--dsw-alias-label-primary) 72%, var(--dsw-alias-label-secondary))'],
    ['gpt-6.1-sol', 'var(--dsw-alias-state-error-primary)'],
    ['gpt-5.6-terra', 'var(--dsw-alias-state-warn-primary)'],
    ['GPT-6-Luna', 'var(--dsw-alias-state-business-primary)'],
  ])('keeps the family color stable across row order: %s', (id, accent) => {
    expect(accentFor(id, 0)).toBe(accent)
    expect(accentFor(id, 3)).toBe(accent)
  })
  it('does not invent a default effort', () => {
    expect(restingEffort(model)).toBe('high')
    expect(restingEffort({ ...model, reasoning: { efforts: model.reasoning.efforts } })).toBeUndefined()
    expect(effortIndex(model, undefined)).toBe(-1)
  })
  it('resolves remembered effort when valid, otherwise defaults to resting effort', () => {
    expect(resolveModelEffort(model, 'low')).toBe('low')
    expect(resolveModelEffort(model, 'invalid')).toBe('high')
    expect(resolveModelEffort(model, undefined)).toBe('high')
    const noDefault = { ...model, reasoning: { efforts: model.reasoning.efforts } }
    expect(resolveModelEffort(noDefault, 'low')).toBe('low')
    expect(resolveModelEffort(noDefault, undefined)).toBeUndefined()
  })
  it('matches provider and model together', () => {
    expect(isCurrentModel({ provider: 'a', model: model.id }, 'b', model)).toBe(false)
    expect(isCurrentModel({ provider: 'a', model: model.id }, 'a', model)).toBe(true)
  })
  it('submits only supported selection fields even when stale metadata claims tiers', () => {
    const stale = { ...model, contextSelection: { values: [1000000] } }
    expect(selectionForRow(stale, 'a', 'high')).toEqual({ provider: 'a', model: model.id, reasoningEffort: 'high' })
    expect(selectionForRow(stale, 'a', 'max')).toEqual({ provider: 'a', model: model.id })
  })
})
