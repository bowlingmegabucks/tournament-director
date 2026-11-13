import { describe, expect, it } from 'vitest'
import { createPayoutRow, createTotal } from '../../mocks/data'
import {
  asPaidFilter,
  atLeast,
  eventKeyOf,
  eventOptions,
  filterRows,
  readMinimum,
} from './listFilters'

const squad = createPayoutRow({
  source: 'squad',
  eventId: 's1',
  eventLabel: 'Squad',
  eventDate: '2026-10-24T09:00:00',
  paid: true,
})
const sweeper = createPayoutRow({
  source: 'sweeper',
  eventId: 'w1',
  eventLabel: 'Sweeper',
  eventDate: '2026-10-24T13:00:00',
})
const finals = createPayoutRow({
  source: 'finals',
  eventId: 'd1',
  eventLabel: 'Finals: Open',
  eventDate: null,
})

describe('eventOptions (PAY-19)', () => {
  it('lists each event once, with the date for a squad or sweeper', () => {
    const options = eventOptions(
      [squad, { ...squad }, sweeper, finals],
      (value) => `on ${value.slice(11, 16)}`,
    )

    expect(options).toEqual([
      { key: 'squad:s1', label: 'Squad on 09:00' },
      { key: 'sweeper:w1', label: 'Sweeper on 13:00' },
      { key: 'finals:d1', label: 'Finals: Open' },
    ])
  })
})

describe('filterRows (PAY-19)', () => {
  const rows = [squad, sweeper, finals]

  it('keeps one event, or all', () => {
    expect(filterRows(rows, eventKeyOf(sweeper), 'all')).toEqual([sweeper])
    expect(filterRows(rows, '', 'all')).toEqual(rows)
  })

  it('keeps the paid or the unpaid', () => {
    expect(filterRows(rows, '', 'paid')).toEqual([squad])
    expect(filterRows(rows, '', 'unpaid')).toEqual([sweeper, finals])
    expect(filterRows(rows, eventKeyOf(squad), 'unpaid')).toEqual([])
  })
})

describe('asPaidFilter', () => {
  it.each([
    ['paid', 'paid'],
    ['unpaid', 'unpaid'],
    ['all', 'all'],
    ['nonsense', 'all'],
    [null, 'all'],
  ])('reads %j as %s', (value, expected) => {
    expect(asPaidFilter(value)).toBe(expected)
  })
})

describe('readMinimum and atLeast (PAY-19)', () => {
  it('reads blank as everyone, bad text as an error, and money as cents', () => {
    expect(readMinimum('')).toEqual({ kind: 'all' })
    expect(readMinimum('lots')).toEqual({
      kind: 'invalid',
      message: 'Enter dollars and cents, like 100.00',
    })
    expect(readMinimum('2,000')).toEqual({ kind: 'least', cents: 200000 })
  })

  it('keeps totals at or above the minimum, including one equal to it', () => {
    const bowlers = [
      createTotal({ name: 'A', total: '2000.00' }),
      createTotal({ name: 'B', total: '1999.99' }),
      createTotal({ name: 'C', total: '2500.50' }),
    ]

    expect(atLeast(bowlers, 200000).map((bowler) => bowler.name)).toEqual(['A', 'C'])
  })
})
