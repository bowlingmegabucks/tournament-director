import { describe, expect, it } from 'vitest'
import { parseUpdateSweeper } from './updateRequest.ts'

const open = '11111111-1111-4111-8111-111111111111'
const women = '22222222-2222-4222-8222-222222222222'

const changes = (body: unknown) => {
  const result = parseUpdateSweeper(body)
  if (!result.success) throw new Error(`refused: ${JSON.stringify(result.errors)}`)
  return result
}
const errors = (body: unknown) => {
  const result = parseUpdateSweeper(body)
  if (result.success) throw new Error('accepted')
  return result.errors
}

describe('parseUpdateSweeper (SQD-23, SQD-29)', () => {
  it('keeps only the fields sent (SQD-23)', () => {
    expect(changes({ games: 4, date: '2026-10-23T19:30' })).toEqual({
      success: true,
      changes: { games: 4, date: '2026-10-23T19:30:00' },
      confirmWarnings: false,
    })
    expect(changes({})).toEqual({ success: true, changes: {}, confirmWarnings: false })
  })

  it('reads confirmWarnings and keeps it out of the changes (D-184)', () => {
    expect(changes({ confirmWarnings: true, games: 4 })).toMatchObject({
      changes: { games: 4 },
      confirmWarnings: true,
    })
  })

  it('refuses a confirmWarnings that is not true or false', () => {
    expect(errors({ confirmWarnings: 'yes' })).toEqual({
      confirmWarnings: 'Send confirmWarnings as true or false',
    })
  })

  it('runs the add checks and messages on each field sent (SQD-11, SQD-12)', () => {
    expect(errors({ entryFee: 0, games: 100, cashRatio: 1, maxPerPair: 1 })).toEqual({
      entryFee: 'Entry fee must be greater than $0',
      games: 'Games must be between 1 and 99',
      cashRatio: 'Cash ratio must be greater than 1',
      maxPerPair: 'Max per pair must be between 2 and 5',
    })
  })

  it('does not accept a blank fee, games, or cash ratio: they are required (D-183)', () => {
    expect(errors({ entryFee: '', games: null, cashRatio: ' ' })).toEqual({
      entryFee: 'Entry fee is required',
      games: 'Games is required',
      cashRatio: 'Cash ratio is required',
    })
  })

  it('takes bonus pins for only the divisions sent, a blank box as 0 (SQD-29, D-184)', () => {
    expect(changes({ bonusPins: { [open]: 10, [women]: '' } }).changes).toEqual({
      bonusPins: { [open]: 10, [women]: 0 },
    })
    expect(changes({ games: 3 }).changes).not.toHaveProperty('bonusPins')
  })

  it('refuses a bad pin under bonusPins.<divisionId> (SQD-13, D-176)', () => {
    expect(errors({ bonusPins: { [open]: 120, [women]: 1.5 } })).toEqual({
      [`bonusPins.${open}`]: 'Bonus pins must be between 0 and 99',
      [`bonusPins.${women}`]: 'Enter a whole number',
    })
    expect(errors({ bonusPins: { 'not-an-id': 3 } })).toEqual({
      bonusPins: 'Bonus pins must be keyed by division id',
    })
  })

  it('refuses lanes that pass lane 200 when both are sent (D-179)', () => {
    expect(errors({ startingLane: 199, numberOfLanes: 4 })).toEqual({
      numberOfLanes: 'Lanes must end at lane 200 or lower',
    })
  })

  it('refuses complete, finalsRatio, and any unknown key (SQD-18, D-181)', () => {
    expect(errors({ complete: true, finalsRatio: 5 })).toEqual({
      complete: 'This field is not accepted',
      finalsRatio: 'This field is not accepted',
    })
  })
})
