import { describe, expect, it } from 'vitest'
import { createSettings } from '../../mocks/data'
import { completedLock, editNotes } from './editNotes'

const quiet = { registrationCount: 0, hasScores: false, hasSweeperScores: false }

describe('editNotes (TRN-29, D-128, D-130)', () => {
  it('has nothing to say when nothing depends on the settings', () => {
    expect(editNotes(createSettings(), quiet)).toEqual({ locks: {}, confirms: {} })
  })

  it('asks for a confirmation on the start date and fee when bowlers are registered', () => {
    const { locks, confirms } = editNotes(createSettings(), { ...quiet, registrationCount: 38 })

    expect(locks).toEqual({})
    expect(confirms).toEqual({
      startDate:
        '38 bowlers are registered. Ages are measured on this date; some may no longer fit their division.',
      entryFee: '38 bowlers are registered. They keep what they paid. New entries pay the new fee.',
    })
  })

  it('says "1 bowler is registered" for one', () => {
    const { confirms } = editNotes(createSettings(), { ...quiet, registrationCount: 1 })

    expect(confirms.entryFee).toMatch(/^1 bowler is registered\. /)
  })

  it('locks games and the start date once a score is saved, and warns on the two ratios', () => {
    const { locks, confirms } = editNotes(createSettings(), { ...quiet, hasScores: true })

    expect(locks).toEqual({
      games: 'Scores are saved, so the number of games cannot change.',
      startDate: 'Scores are saved, so the start date cannot change.',
    })
    expect(confirms).toEqual({
      finalsRatio: 'Scores are saved. Posted results change at once.',
      cashRatio: 'Scores are saved. Posted results change at once.',
    })
  })

  it('does not ask to confirm a start date it has locked', () => {
    const { confirms } = editNotes(createSettings(), {
      registrationCount: 38,
      hasScores: true,
      hasSweeperScores: false,
    })

    expect(confirms.startDate).toBeUndefined()
    expect(confirms.entryFee).toBeDefined()
  })

  it('warns on the super sweeper ratio only for sweeper scores', () => {
    expect(
      editNotes(createSettings(), { ...quiet, hasScores: true }).confirms.superSweeperCashRatio,
    ).toBeUndefined()
    expect(
      editNotes(createSettings(), { ...quiet, hasScores: true, hasSweeperScores: true }).confirms
        .superSweeperCashRatio,
    ).toBe('Sweeper scores are saved. Posted results change at once.')
  })

  it('locks every field of a complete tournament, and asks for nothing', () => {
    const { locks, confirms } = editNotes(createSettings({ completed: true }), {
      registrationCount: 38,
      hasScores: true,
      hasSweeperScores: true,
    })

    expect(Object.keys(locks).toSorted()).toEqual(
      [
        'bowlingCenter',
        'cashRatio',
        'endDate',
        'entryFee',
        'finalsRatio',
        'games',
        'name',
        'startDate',
        'superSweeperCashRatio',
      ].toSorted(),
    )
    expect(Object.values(locks).every((lock) => lock === completedLock)).toBe(true)
    expect(confirms).toEqual({})
  })
})
