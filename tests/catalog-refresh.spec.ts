import { describe, expect, it, vi } from 'vitest'
import { forceCatalogReload } from '../src/client/catalog-refresh.ts'

describe('shared catalog cache invalidation', () => {
  it('reloads the resolver-held catalog and tolerates missing internals', () => {
    const refresh = vi.fn()
    forceCatalogReload({ catalog: { refresh } })
    expect(refresh).toHaveBeenCalledOnce()
    expect(() => {
      forceCatalogReload({ catalog: {} })
      forceCatalogReload({})
      forceCatalogReload(undefined)
    }).not.toThrow()
  })
})
