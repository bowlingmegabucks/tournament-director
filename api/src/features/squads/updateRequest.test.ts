import { describe, expect, it } from 'vitest'
import { parseUpdateSquad } from './updateRequest.ts'

const changes = (body: unknown) => {
  const result = parseUpdateSquad(body)
  if (!result.success) throw new Error(`refused: ${JSON.stringify(result.errors)}`)
  return result
}
const errors = (body: unknown) => {
  const result = parseUpdateSquad(body)
  if (result.success) throw new Error('accepted')
  return result.errors
}

describe('parseUpdateSquad (SQD-23)', () => {
  it('keeps only the fields sent and trims the date to the minute (SQD-23)', () => {
    expect(changes({ date: '2026-10-24T13:00', maxPerPair: 3 })).toEqual({
      success: true,
      changes: { date: '2026-10-24T13:00:00', maxPerPair: 3 },
      confirmWarnings: false,
    })
  })

  it('accepts an empty body: nothing to change (SQD-23)', () => {
    expect(changes({})).toEqual({ success: true, changes: {}, confirmWarnings: false })
  })

  it('reads confirmWarnings and keeps it out of the changes (D-184)', () => {
    expect(changes({ confirmWarnings: true, startingLane: 3 })).toEqual({
      success: true,
      changes: { startingLane: 3 },
      confirmWarnings: true,
    })
    expect(errors({ confirmWarnings: 'yes' })).toEqual({
      confirmWarnings: 'Send confirmWarnings as true or false',
    })
  })

  it.each(['', '  ', null])('clears an override sent as %j (D-183)', (blank) => {
    expect(changes({ entryFee: blank, finalsRatio: blank, cashRatio: blank }).changes).toEqual({
      entryFee: null,
      finalsRatio: null,
      cashRatio: null,
    })
  })

  it('runs the add checks and messages on each field sent (SQD-02, SQD-04 to SQD-06, SQD-08)', () => {
    expect(
      errors({
        date: 'soon',
        startingLane: 2,
        numberOfLanes: 3,
        maxPerPair: 6,
        entryFee: 1000,
        finalsRatio: 1,
        cashRatio: 100,
      }),
    ).toEqual({
      date: 'Enter a date and time',
      startingLane: 'Starting lane must be odd',
      numberOfLanes: 'Number of lanes must be even',
      maxPerPair: 'Max per pair must be between 2 and 5',
      entryFee: 'Entry fee must be between $0 and $999.99',
      finalsRatio: 'Finals ratio must be greater than 1',
      cashRatio: 'Cash ratio cannot be more than 99.9',
    })
  })

  it('does not check a field left out (D-17)', () => {
    expect(errors({ maxPerPair: 9 })).toEqual({
      maxPerPair: 'Max per pair must be between 2 and 5',
    })
    expect(changes({ cashRatio: 2 }).changes).toEqual({ cashRatio: 2 })
  })

  it('refuses lanes that pass lane 200 when both are sent (D-179)', () => {
    expect(errors({ startingLane: 199, numberOfLanes: 4 })).toEqual({
      numberOfLanes: 'Lanes must end at lane 200 or lower',
    })
  })

  it('refuses complete and any unknown key, so an edit cannot reopen a squad (SQD-18, D-181)', () => {
    expect(errors({ complete: false })).toEqual({ complete: 'This field is not accepted' })
    expect(errors({ games: 3, id: 'x' })).toEqual({
      games: 'This field is not accepted',
      id: 'This field is not accepted',
    })
  })

  it('refuses a body that is not an object', () => {
    const result = parseUpdateSquad([])
    expect(result.success).toBe(false)
    if (!result.success) expect(result.message).toBe('Send the squad as a JSON object.')
  })
})
