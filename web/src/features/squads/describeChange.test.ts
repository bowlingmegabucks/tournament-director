import { describe, expect, it } from 'vitest'
import { describeChange } from './describeChange'
import { emptySquadForm } from './validateSquad'
import type { SquadFormValues } from './types'

const initial: SquadFormValues = {
  date: '2026-10-24T09:00',
  startingLane: '1',
  numberOfLanes: '20',
  maxPerPair: '4',
  entryFee: '60',
  finalsRatio: '',
  cashRatio: '4',
}

describe('describeChange (SQD-28)', () => {
  it('shows the date as the lists do', () => {
    expect(describeChange('date', initial, { ...initial, date: '2026-10-24T13:00' })).toBe(
      'Date: Sat 10/24/2026 9:00 AM → Sat 10/24/2026 1:00 PM',
    )
  })

  it('shows money and ratios as the cards do', () => {
    expect(describeChange('entryFee', initial, { ...initial, entryFee: '75' })).toBe(
      'Entry fee: $60.00 → $75.00',
    )
    expect(describeChange('cashRatio', initial, { ...initial, cashRatio: '3.5' })).toBe(
      'Cash ratio: 1 in 4.0 → 1 in 3.5',
    )
  })

  it("names a blank fee or ratio as the tournament's value (D-183)", () => {
    expect(describeChange('entryFee', initial, { ...initial, entryFee: ' ' })).toBe(
      "Entry fee: $60.00 → the tournament's value",
    )
    expect(describeChange('finalsRatio', initial, { ...initial, finalsRatio: '5' })).toBe(
      "Finals ratio: the tournament's value → 1 in 5.0",
    )
  })

  it('names the lane boxes the way the form does', () => {
    expect(describeChange('startingLane', initial, { ...initial, startingLane: '3' })).toBe(
      'Starting lane: 1 → 3',
    )
    expect(describeChange('numberOfLanes', initial, { ...initial, numberOfLanes: '24' })).toBe(
      'Number of lanes: 20 → 24',
    )
    expect(describeChange('maxPerPair', initial, { ...initial, maxPerPair: '3' })).toBe(
      'Bowlers per pair: 4 → 3',
    )
  })

  it('says not set for a cleared date, and shows text that is not a number as typed', () => {
    expect(describeChange('date', initial, emptySquadForm)).toMatch(/→ not set$/)
    expect(describeChange('entryFee', initial, { ...initial, entryFee: 'abc' })).toBe(
      'Entry fee: $60.00 → abc',
    )
    expect(describeChange('finalsRatio', initial, { ...initial, finalsRatio: 'x' })).toBe(
      "Finals ratio: the tournament's value → x",
    )
  })
})
