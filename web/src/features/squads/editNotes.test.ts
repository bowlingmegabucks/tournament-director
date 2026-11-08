import { describe, expect, it } from 'vitest'
import { resultsNote, type SessionEditInfo } from '../../shared/sessionEdit'
import { squadEditNotes } from './editNotes'

const none: SessionEditInfo = {
  entryCount: 0,
  assignmentCount: 0,
  hasScores: false,
  lowestAssignedLane: null,
  highestAssignedLane: null,
  fullestPair: null,
}

describe('squadEditNotes (SQD-27, D-180)', () => {
  it('has no notes with nothing depending on the squad', () => {
    expect(squadEditNotes(none)).toEqual({})
  })

  it('asks to confirm the ratios once a score exists in this squad, not the fee', () => {
    const notes = squadEditNotes({ ...none, hasScores: true })
    expect(notes.finalsRatio).toEqual({ confirm: resultsNote })
    expect(notes.cashRatio).toEqual({ confirm: resultsNote })
    expect(notes.entryFee).toBeUndefined()
    expect(notes.date).toBeUndefined()
  })

  it('never locks a box (a squad refuses only when complete)', () => {
    const notes = squadEditNotes({
      entryCount: 5,
      assignmentCount: 5,
      hasScores: true,
      lowestAssignedLane: 1,
      highestAssignedLane: 4,
      fullestPair: 3,
    })
    expect(Object.values(notes).some((note) => note?.lock !== undefined)).toBe(false)
  })

  it('keeps the entry and lane notes the sweeper shares', () => {
    const notes = squadEditNotes({ ...none, entryCount: 3 })
    expect(notes.date?.confirm).toMatch(/3 bowlers are entered/)
    expect(notes.entryFee?.confirm).toMatch(/They keep what they paid/)
  })
})
