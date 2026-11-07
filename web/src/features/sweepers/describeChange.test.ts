import { describe, expect, it } from 'vitest'
import { describeChange } from './describeChange'
import { emptySweeperForm } from './validateSweeper'
import type { SweeperFormValues } from './types'

const divisions = [
  { id: 'o', name: 'Open' },
  { id: 'w', name: 'Women' },
]
const initial: SweeperFormValues = {
  date: '2026-10-23T19:00',
  startingLane: '11',
  numberOfLanes: '10',
  maxPerPair: '3',
  entryFee: '20',
  games: '3',
  cashRatio: '5',
  bonusPins: { o: '10' },
}
const line = (field: string, values: Partial<SweeperFormValues>) =>
  describeChange(field, initial, { ...initial, ...values }, divisions)

describe('describeChange: spaces around the typed text (SQD-28)', () => {
  it('ignores them in a box and in a pin', () => {
    expect(line('games', { games: ' 4 ' })).toBe('Games: 3 → 4')
    expect(line('bonusPins.o', { bonusPins: { o: ' 8 ' } })).toBe('Open bonus pins: 10 → 8')
    expect(line('bonusPins.o', { bonusPins: { o: '  ' } })).toBe('Open bonus pins: 10 → none')
    expect(describeChange('games', initial, { ...initial, games: '  ' }, divisions)).toBe(
      'Games: 3 → not set',
    )
  })
})

describe('describeChange (SQD-28)', () => {
  it('shows the date, money, and ratio as the cards do', () => {
    expect(line('date', { date: '2026-10-23T20:30' })).toBe(
      'Date: Fri 10/23/2026 7:00 PM → Fri 10/23/2026 8:30 PM',
    )
    expect(line('entryFee', { entryFee: '25' })).toBe('Entry fee: $20.00 → $25.00')
    expect(line('cashRatio', { cashRatio: '4' })).toBe('Cash ratio: 1 in 5.0 → 1 in 4.0')
  })

  it('names the other boxes the way the form does', () => {
    expect(line('games', { games: '4' })).toBe('Games: 3 → 4')
    expect(line('startingLane', { startingLane: '13' })).toBe('Starting lane: 11 → 13')
    expect(line('numberOfLanes', { numberOfLanes: '12' })).toBe('Number of lanes: 10 → 12')
    expect(line('maxPerPair', { maxPerPair: '4' })).toBe('Bowlers per pair: 3 → 4')
  })

  it('shows a pin by its division name, a blank or 0 as none (SQD-29)', () => {
    expect(line('bonusPins.o', { bonusPins: { o: '8' } })).toBe('Open bonus pins: 10 → 8')
    expect(line('bonusPins.o', { bonusPins: { o: '' } })).toBe('Open bonus pins: 10 → none')
    expect(line('bonusPins.w', { bonusPins: { o: '10', w: '6' } })).toBe(
      'Women bonus pins: none → 6',
    )
    expect(line('bonusPins.w', { bonusPins: { o: '10', w: '0' } })).toBe(
      'Women bonus pins: none → none',
    )
  })

  it('says not set for a cleared box, and gives nothing for a key it does not know', () => {
    expect(describeChange('date', initial, emptySweeperForm, divisions)).toMatch(/→ not set$/)
    expect(line('entryFee', { entryFee: 'abc' })).toBe('Entry fee: $20.00 → abc')
    expect(line('cashRatio', { cashRatio: 'x' })).toBe('Cash ratio: 1 in 5.0 → x')
    expect(line('bonusPins', {})).toBe('')
    expect(line('bonusPins.gone', {})).toBe('')
  })
})
