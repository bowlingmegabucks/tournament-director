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

  it('flags through the guarded write and says whether the flag is new (D-249)', async () => {
    const { store, state } = createInMemoryDnfStore()
    const input = {
      tournamentId: 't1',
      kind: 'squad' as const,
      sessionId: 's1',
      registrationId: 'r1',
    }

    expect(await store.setIfOpen(input)).toBe('set')
    expect(await store.setIfOpen(input)).toBe('same')
    expect(state).toEqual(new Set(['s1|r1']))
  })
})
