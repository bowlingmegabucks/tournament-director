import { describe, expect, it } from 'vitest'
import { createInMemoryDnfStore } from './store.ts'

describe('in-memory DNF store', () => {
  it('sets, repeats, lists, and clears (SCR-24)', async () => {
    const { store } = createInMemoryDnfStore()

    expect(await store.set('s1', 'r1')).toBe(true)
    expect(await store.set('s1', 'r1')).toBe(false)
    await store.set('s2', 'r2')
    expect((await store.listFlagged(['s1'])).get('s1')).toEqual(new Set(['r1']))
    expect([...(await store.listFlagged(['s1', 's2'])).keys()].toSorted()).toEqual(['s1', 's2'])
    expect(await store.clear('s1', 'r1')).toBe(true)
    expect(await store.clear('s1', 'r1')).toBe(false)
    expect((await store.listFlagged(['s1'])).size).toBe(0)
  })
})
