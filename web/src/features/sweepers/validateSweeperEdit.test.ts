import { describe, expect, it } from 'vitest'
import { createSweeper } from '../../mocks/data'
import {
  changedPins,
  changedScalars,
  toFormValues,
  toSweeperChanges,
  validateSweeperChanges,
} from './validateSweeper'

const dates = { startDate: '2026-10-23', endDate: '2026-10-25' }
const ids = ['o', 'w']
const sweeper = createSweeper({
  date: '2026-10-23T19:00:00',
  startingLane: 11,
  numberOfLanes: 10,
  maxPerPair: 3,
  entryFee: 20,
  games: 3,
  cashRatio: 5,
  bonusPins: [{ divisionId: 'o', divisionName: 'Open', bonusPinsPerGame: 10 }],
})
const initial = toFormValues(sweeper)

describe('toFormValues (SQD-27)', () => {
  it('turns the stored sweeper into box text: the date to the minute, a pin only where there is one', () => {
    expect(initial).toEqual({
      date: '2026-10-23T19:00',
      startingLane: '11',
      numberOfLanes: '10',
      maxPerPair: '3',
      entryFee: '20',
      games: '3',
      cashRatio: '5',
      bonusPins: { o: '10' },
    })
  })
})

describe('pins with spaces (SQD-29)', () => {
  it('counts a pin of only spaces as blank, so as 0', () => {
    expect(changedPins(initial, { ...initial, bonusPins: { o: '10', w: '  ' } }, ids)).toEqual([])
    expect(changedPins(initial, { ...initial, bonusPins: { o: ' 10 ' } }, ids)).toEqual([])
  })
})

describe('changedScalars and changedPins', () => {
  it('lists the scalar boxes whose trimmed text differs', () => {
    expect(changedScalars(initial, initial)).toEqual([])
    expect(changedScalars(initial, { ...initial, games: ' 4 ', cashRatio: '5 ' })).toEqual([
      'games',
    ])
  })

  it('treats a blank pin and a 0 as the same, and a changed number as changed (SQD-29)', () => {
    expect(changedPins(initial, initial, ids)).toEqual([])
    expect(changedPins(initial, { ...initial, bonusPins: { o: '10', w: '0' } }, ids)).toEqual([])
    expect(changedPins(initial, { ...initial, bonusPins: { o: '', w: '' } }, ids)).toEqual(['o'])
    expect(changedPins(initial, { ...initial, bonusPins: { o: '10', w: '6' } }, ids)).toEqual(['w'])
    expect(changedPins(initial, { ...initial, bonusPins: { o: 'x' } }, ids)).toEqual(['o'])
  })
})

describe('validateSweeperChanges (SQD-27, D-17)', () => {
  it('has no problems when nothing changed, even if a stored value breaks a rule', () => {
    const odd = { ...initial, numberOfLanes: '7', entryFee: '0' }
    expect(validateSweeperChanges(odd, odd, dates, ids)).toEqual({})
  })

  it('checks a changed box with the add rule and message', () => {
    expect(
      validateSweeperChanges(initial, { ...initial, games: '100', entryFee: '1000' }, dates, ids),
    ).toEqual({
      games: 'Games must be between 1 and 99',
      entryFee: 'Entry fee cannot be more than $999.99',
    })
    expect(validateSweeperChanges(initial, { ...initial, cashRatio: '' }, dates, ids)).toEqual({
      cashRatio: 'Cash ratio is required',
    })
  })

  it('checks a changed pin box under bonusPins.<id>, and only that one', () => {
    const odd = { ...initial, bonusPins: { o: '120', w: '' } }
    expect(
      validateSweeperChanges(odd, { ...odd, bonusPins: { o: '120', w: '1.5' } }, dates, ids),
    ).toEqual({ 'bonusPins.w': 'Enter a whole number' })
  })

  it('checks the lane block when the starting lane changes (D-179)', () => {
    expect(
      validateSweeperChanges(initial, { ...initial, startingLane: '199' }, dates, ids),
    ).toEqual({
      numberOfLanes: 'Lanes must end at lane 200 or lower',
    })
  })
})

describe('toSweeperChanges (SQD-23, SQD-29)', () => {
  it('sends nothing when nothing changed', () => {
    expect(toSweeperChanges(initial, initial, ids)).toEqual({})
  })

  it('sends only the changed boxes as numbers, the date trimmed', () => {
    expect(
      toSweeperChanges(
        initial,
        { ...initial, date: ' 2026-10-23T20:00 ', games: '4', entryFee: '25.5', cashRatio: '4' },
        ids,
      ),
    ).toEqual({ date: '2026-10-23T20:00', games: 4, entryFee: 25.5, cashRatio: 4 })
  })

  it('sends only the pins that changed, a blank as null', () => {
    expect(toSweeperChanges(initial, { ...initial, bonusPins: { o: '', w: '6' } }, ids)).toEqual({
      bonusPins: { o: null, w: 6 },
    })
  })
})
