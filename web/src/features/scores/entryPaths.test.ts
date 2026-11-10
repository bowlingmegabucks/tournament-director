import { describe, expect, it } from 'vitest'
import { entryPath } from './entryPaths'

describe('entryPath (SCR-21)', () => {
  it('is the entry start with no game', () => {
    expect(entryPath('squad', 't1', 's1')).toBe('/tournaments/t1/squads/s1/scores/entry')
  })

  it('is the board of a game, and the sheet of a pair in it', () => {
    expect(entryPath('squad', 't1', 's1', 2)).toBe('/tournaments/t1/squads/s1/scores/entry/2')
    expect(entryPath('sweeper', 't1', 's1', 2, 13)).toBe(
      '/tournaments/t1/sweepers/s1/scores/entry/2/13',
    )
  })
})
