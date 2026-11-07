import { describe, expect, it } from 'vitest'
import { resultsNote, type SessionEditInfo } from '../../shared/sessionEdit'
import { gamesLocked, sweeperEditNotes } from './editNotes'

const none: SessionEditInfo = {
  entryCount: 0,
  assignmentCount: 0,
  hasScores: false,
  lowestAssignedLane: null,
  highestAssignedLane: null,
  fullestPair: null,
}

describe('sweeperEditNotes (SQD-27, SQD-29, D-180)', () => {
  it('has no notes with nothing depending on the sweeper', () => {
    expect(sweeperEditNotes(none, ['d1'])).toEqual({})
  })

  it('locks games and asks to confirm the cash ratio and each pin once a score exists', () => {
    const notes = sweeperEditNotes({ ...none, hasScores: true }, ['d1', 'd2'])
    expect(notes['games']).toEqual({ lock: gamesLocked })
    expect(notes['cashRatio']).toEqual({ confirm: resultsNote })
    expect(notes['bonusPins.d1']).toEqual({ confirm: resultsNote })
    expect(notes['bonusPins.d2']).toEqual({ confirm: resultsNote })
    expect(notes['entryFee']).toBeUndefined()
  })

  it('says the games lock in the API words', () => {
    expect(gamesLocked).toBe('Scores are saved, so the number of games cannot change.')
  })

  it('keeps the entry and lane notes the squad shares, and locks nothing without scores', () => {
    const notes = sweeperEditNotes({ ...none, entryCount: 4 }, [])
    expect(notes['date']?.confirm).toMatch(/4 bowlers are entered/)
    expect(notes['entryFee']?.confirm).toMatch(/They keep what they paid/)
    expect(notes['games']).toBeUndefined()
  })
})
