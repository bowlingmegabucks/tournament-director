import { describe, expect, it } from 'vitest'
import {
  buildPairs,
  comparePositions,
  MAX_SEATS,
  parsePosition,
  pairOf,
  SEAT_ORDER,
} from './positions.ts'

describe('parsePosition', () => {
  it.each([
    ['15A', { lane: 15, letter: 'A' }],
    ['1A', { lane: 1, letter: 'A' }],
    ['99E', { lane: 99, letter: 'E' }],
    ['2C', { lane: 2, letter: 'C' }],
  ])('parses %s (LAN-01)', (text, expected) => {
    expect(parsePosition(text)).toEqual(expected)
  })

  it.each(['', '1F', '0A', '05A', '100A', 'a1', '1a', 'A1', '1AB', ' 1A', '1A '])(
    'rejects %j (LAN-01)',
    (text) => {
      expect(parsePosition(text)).toBeUndefined()
    },
  )
})

describe('seat order', () => {
  it('fills A, C, B, D, E and stops at 5 (LAN-02, D-56)', () => {
    expect([...SEAT_ORDER]).toEqual(['A', 'C', 'B', 'D', 'E'])
    expect(MAX_SEATS).toBe(5)
  })
})

describe('comparePositions', () => {
  it('sorts by lane, then letter (LAN-04)', () => {
    const sorted = ['2C', '1B', '12A', '1A', '2D']
      .map((text) => parsePosition(text))
      .filter((position) => position !== undefined)
      .sort(comparePositions)
      .map(({ lane, letter }) => `${lane}${letter}`)

    expect(sorted).toEqual(['1A', '1B', '2C', '2D', '12A'])
  })

  it('treats the same position as equal', () => {
    expect(comparePositions({ lane: 3, letter: 'A' }, { lane: 3, letter: 'A' })).toBe(0)
  })
})

describe('buildPairs', () => {
  it('runs from the starting lane, two lanes at a time (LAN-03)', () => {
    expect(buildPairs(11, 10).map((pair) => pair.lanes)).toEqual([
      [11, 12],
      [13, 14],
      [15, 16],
      [17, 18],
      [19, 20],
    ])
  })

  it('names the first lane of each pair (LAN-03)', () => {
    expect(buildPairs(1, 4).map((pair) => pair.firstLane)).toEqual([1, 3])
  })

  it.each([0, -2])('gives no pairs for %i lanes (LAN-03)', (count) => {
    expect(buildPairs(1, count)).toEqual([])
  })

  it('ends with a one-lane pair when the count is odd (LAN-03)', () => {
    expect(buildPairs(1, 5).map((pair) => pair.lanes)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('still pairs from an even starting lane (LAN-03)', () => {
    expect(buildPairs(2, 4).map((pair) => pair.lanes)).toEqual([
      [2, 3],
      [4, 5],
    ])
  })
})

describe('pairOf', () => {
  const pairs = buildPairs(11, 6)

  it('finds the pair that holds either lane', () => {
    expect(pairOf(13, pairs)?.firstLane).toBe(13)
    expect(pairOf(14, pairs)?.firstLane).toBe(13)
  })

  it.each([10, 17, 31])('gives undefined for lane %i, outside the session', (lane) => {
    expect(pairOf(lane, pairs)).toBeUndefined()
  })
})
