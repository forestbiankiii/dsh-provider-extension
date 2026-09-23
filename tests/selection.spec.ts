import { describe, expect, it } from 'vitest'
import { accentFor, effortIndex, isCurrentModel, resolveModelEffort, restingEffort, selectionForRow } from '../src/client/selection.ts'
const model = { id: 'gpt-5.6-sol', name: 'Sol', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' } }
describe('model selection policy', () => {
  it('uses family accents', () => { expect(accentFor(model.id, 1)).toBe('#E3A552') })
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
