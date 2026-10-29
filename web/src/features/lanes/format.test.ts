import { describe, expect, it } from 'vitest'
import { createLaneBowler, createLanePage, createLanePair } from '../../mocks/data'
import { countBowlers, formatBowler, formatFill, formatPair, formatTotals } from './format'

describe('formatPair', () => {
  it('names both lanes (LAN-03)', () => {
    expect(formatPair({ lanes: [1, 2] })).toBe('Lanes 1-2')
    expect(formatPair({ lanes: [11, 12] })).toBe('Lanes 11-12')
  })

  it('names the first and the last lane of a longer run', () => {
    expect(formatPair({ lanes: [1, 2, 3] })).toBe('Lanes 1-3')
  })

  it('names a lone lane', () => {
    expect(formatPair({ lanes: [5] })).toBe('Lane 5')
  })

  it('does not crash on no lanes', () => {
    expect(formatPair({ lanes: [] })).toBe('Lane ')
  })
})

describe('formatFill', () => {
  const some = (count: number) => Array.from({ length: count }, () => createLaneBowler())

  it('counts the bowlers of the capacity', () => {
    expect(formatFill({ bowlers: some(3), capacity: 5 })).toBe('3 of 5')
    expect(formatFill({ bowlers: [], capacity: 5 })).toBe('0 of 5')
  })

  it('says full at capacity and past it (D-58)', () => {
    expect(formatFill({ bowlers: some(5), capacity: 5 })).toBe('5 of 5, full')
    expect(formatFill({ bowlers: some(3), capacity: 2 })).toBe('3 of 2, full')
  })
})

describe('formatBowler (LAN-11)', () => {
  const bowler = createLaneBowler({
    divisionName: 'Women',
    average: 168,
    pins: 47,
    superSweeper: true,
  })

  it('shows division, average, and handicap on a squad', () => {
    expect(formatBowler(bowler, 'squad', false)).toBe('Women · avg 168 · hdcp 47')
  })

  it('shows bonus pins and super sweeper Y on a sweeper', () => {
    expect(formatBowler(bowler, 'sweeper', false)).toBe(
      'Women · avg 168 · +47 pins · super sweeper: Y',
    )
  })

  it('shows super sweeper N', () => {
    expect(formatBowler({ ...bowler, superSweeper: false }, 'sweeper', false)).toContain(
      'super sweeper: N',
    )
  })

  it('says no average when there is none', () => {
    expect(formatBowler({ ...bowler, average: null }, 'squad', false)).toBe(
      'Women · no average · hdcp 47',
    )
  })

  it('leaves out the average in the compact form', () => {
    expect(formatBowler(bowler, 'squad', true)).toBe('Women · hdcp 47')
    expect(formatBowler({ ...bowler, average: null }, 'squad', true)).toBe('Women · hdcp 47')
  })
})

describe('countBowlers and formatTotals (LAN-10)', () => {
  const page = createLanePage({
    pairs: [
      createLanePair(1, [createLaneBowler(), createLaneBowler()]),
      createLanePair(3, [createLaneBowler()]),
    ],
    unassigned: [createLaneBowler(), createLaneBowler()],
    other: [createLaneBowler()],
  })

  it('counts every bowler on the page', () => {
    expect(countBowlers(page)).toBe(6)
  })

  it('says how many need a lane', () => {
    expect(formatTotals(page)).toBe('6 bowlers, 2 need a lane')
  })

  it('uses the singular', () => {
    const one = createLanePage({ unassigned: [createLaneBowler()] })

    expect(formatTotals(one)).toBe('1 bowler, 1 needs a lane')
  })

  it('handles nobody', () => {
    expect(formatTotals(createLanePage())).toBe('0 bowlers, 0 need a lane')
  })
})
