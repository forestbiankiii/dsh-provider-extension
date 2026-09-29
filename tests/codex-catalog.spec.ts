import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// Exercise the actual catalog implementation without loading the bundled OAuth runtime.
const source = readFileSync(new URL('../src/codex/index.js', import.meta.url), 'utf8')
const catalogSource = source.split('//#region src/model-catalog.js')[1]!.split('//#endregion')[0]!
const createCatalog = new Function('PACKAGE_VERSION', 'USER_AGENT', `${catalogSource}\nreturn createOfficialModelCatalog;`)('test', 'test')
const remote = (id: string) => new Response(JSON.stringify({ models: [{ slug: id, visibility: 'list', display_name: id }] }))
const options = () => ({
  getAuth: async () => ({ auth: { apiKey: 'test-only' } }),
  readCredential: async () => ({ type: 'oauth', accountId: 'test-account' }),
  baseModels: () => [{ id: 'fallback', name: 'Fallback' }],
})

describe('Codex catalog invalidation', () => {
  it('notifies after online models commit and again when the account catalog is cleared', async () => {
    const onChange = vi.fn(() => snapshots.push(catalog.getModels([]).map((m: { id: string }) => m.id)))
    const snapshots: string[][] = []
    const catalog = createCatalog({ ...options(), fetch: async () => remote('online-only'), onChange })
    await catalog.refresh()
    expect(snapshots).toEqual([['online-only']])
    catalog.clear()
    expect(snapshots).toEqual([['online-only'], []])
    expect(onChange).toHaveBeenCalledTimes(2)
  })
  it('does not publish a failed fetch or an unchanged 304 response', async () => {
    const onChange = vi.fn()
    const fetch = vi.fn().mockResolvedValueOnce(remote('online-only'))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockRejectedValueOnce(new Error('offline'))
    const catalog = createCatalog({ ...options(), fetch, onChange })
    await catalog.refresh()
    await catalog.refresh()
    await expect(catalog.refresh()).rejects.toThrow('offline')
    expect(onChange).toHaveBeenCalledOnce()
    expect(catalog.getModels([])[0].id).toBe('online-only')
  })
  it('does not publish a late response from the previous account', async () => {
    let resolve!: (response: Response) => void
    const onChange = vi.fn()
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done }))
    const catalog = createCatalog({ ...options(), fetch, onChange })
    const refreshing = catalog.refresh().catch(() => {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    catalog.clear()
    resolve(remote('previous-account'))
    await refreshing
    expect(onChange).toHaveBeenCalledOnce()
    expect(catalog.getModels([])).toEqual([])
  })
})
