import { describe, expect, it } from 'vitest'
import { createSquad } from '../../mocks/data'
import { changedFields, toFormValues, toSquadChanges, validateSquadChanges } from './validateSquad'

const dates = { startDate: '2026-10-23', endDate: '2026-10-25' }
const squad = createSquad({
  date: '2026-10-24T09:00:00',
  startingLane: 1,
  numberOfLanes: 20,
  maxPerPair: 4,
  entryFee: 60,
  entryFeeOverridden: true,
  finalsRatio: 7,
  finalsRatioOverridden: false,
  cashRatio: 3.5,
  cashRatioOverridden: true,
})
const initial = toFormValues(squad)

describe('toFormValues (SQD-27, D-183)', () => {
  it('turns the stored squad into box text: the date to the minute, overrides as set, the rest blank', () => {
    expect(initial).toEqual({
      date: '2026-10-24T09:00',
      startingLane: '1',
      numberOfLanes: '20',
      maxPerPair: '4',
      entryFee: '60',
      finalsRatio: '',
      cashRatio: '3.5',
    })
  })
})

describe('toFormValues for a squad that overrides nothing (D-183)', () => {
  it('leaves every override blank', () => {
    const plain = toFormValues(
      createSquad({
        entryFeeOverridden: false,
        finalsRatioOverridden: false,
        cashRatioOverridden: false,
      }),
    )
    expect([plain.entryFee, plain.finalsRatio, plain.cashRatio]).toEqual(['', '', ''])
  })
})

describe('changedFields', () => {
  it('ignores spaces around the starting text too', () => {
    expect(changedFields({ ...initial, entryFee: ' 60 ' }, { ...initial, entryFee: '60' })).toEqual(
      [],
    )
  })

  it('lists the boxes whose trimmed text differs, in form order', () => {
    expect(changedFields(initial, initial)).toEqual([])
    expect(
      changedFields(initial, {
        ...initial,
        cashRatio: ' 3.5 ',
        maxPerPair: '3',
        date: '2026-10-24T10:00',
      }),
    ).toEqual(['date', 'maxPerPair'])
  })
})

describe('validateSquadChanges (SQD-27, D-17)', () => {
  it('has no problems when nothing changed, even if a stored value breaks a rule', () => {
    const odd = { ...initial, numberOfLanes: '7', startingLane: '2' }
    expect(validateSquadChanges(odd, odd, dates)).toEqual({})
  })

  it('checks a changed box with the add rule and message', () => {
    expect(validateSquadChanges(initial, { ...initial, maxPerPair: '9' }, dates)).toEqual({
      maxPerPair: 'Max per pair must be between 2 and 5',
    })
    expect(validateSquadChanges(initial, { ...initial, date: '2026-10-26T09:00' }, dates)).toEqual({
      date: 'Squad date must be before tournament end',
    })
  })

  it('checks the lane block when the starting lane changes, and when the count changes', () => {
    expect(validateSquadChanges(initial, { ...initial, startingLane: '199' }, dates)).toEqual({
      numberOfLanes: 'Lanes must end at lane 200 or lower',
    })
    expect(validateSquadChanges(initial, { ...initial, numberOfLanes: '200' }, dates)).toEqual({})
    const wide = { ...initial, startingLane: '3' }
    expect(validateSquadChanges(wide, { ...wide, numberOfLanes: '200' }, dates)).toEqual({
      numberOfLanes: 'Lanes must end at lane 200 or lower',
    })
  })

  it('does not report a problem in a box the director left alone', () => {
    const odd = { ...initial, entryFee: '5000' }
    expect(validateSquadChanges(odd, { ...odd, maxPerPair: '3' }, dates)).toEqual({})
  })
})

describe('toSquadChanges (SQD-23)', () => {
  it('sends nothing when nothing changed', () => {
    expect(toSquadChanges(initial, initial)).toEqual({})
  })

  it('sends only the changed boxes, as numbers, the date trimmed', () => {
    expect(
      toSquadChanges(initial, {
        ...initial,
        date: ' 2026-10-24T13:00 ',
        startingLane: '3',
        numberOfLanes: '24',
        maxPerPair: '5',
        entryFee: '75.5',
        finalsRatio: '5.5',
      }),
    ).toEqual({
      date: '2026-10-24T13:00',
      startingLane: 3,
      numberOfLanes: 24,
      maxPerPair: 5,
      entryFee: 75.5,
      finalsRatio: 5.5,
    })
  })

  it('sends null for a cleared override (D-183)', () => {
    expect(toSquadChanges(initial, { ...initial, entryFee: '', cashRatio: '  ' })).toEqual({
      entryFee: null,
      cashRatio: null,
    })
  })
})
