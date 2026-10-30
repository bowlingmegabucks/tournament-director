import { describe, expect, it } from 'vitest'
import { crossLanes, lanesInUse, skipFor } from './cross.ts'

const range = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, i) => first + i)

/** The cross as the sheet prints it, such as `1A 4A`. */
function label(
  start: number,
  letter: string,
  lanes: number[],
  games: number,
  pattern: 'same' | 'staggered',
) {
  return crossLanes(start, lanes, games, pattern)
    .map((lane) => `${lane}${letter}`)
    .join(' ')
}

describe('crossLanes: the worked examples in lane-assignments.md (LAN-19)', () => {
  it.each([
    ['1-16 same, 1A, 6 games', 1, 'A', 16, 6, 'same', '1A 4A 5A 8A 9A 12A'],
    ['1-16 same, 2B, 6 games', 2, 'B', 16, 6, 'same', '2B 3B 6B 7B 10B 11B'],
    ['1-16 staggered, 1A, 6 games', 1, 'A', 16, 6, 'staggered', '1A 4A 7A 10A 11A 14A'],
    ['1-24 same, 1A, 6 games', 1, 'A', 24, 6, 'same', '1A 6A 9A 14A 17A 22A'],
    ['1-24 staggered, 1A, 8 games', 1, 'A', 24, 8, 'staggered', '1A 6A 11A 14A 17A 22A 3A 6A'],
  ] as const)('%s', (_name, start, letter, last, games, pattern, expected) => {
    expect(label(start, letter, range(1, last), games, pattern)).toBe(expected)
  })

  it('keeps the letter and swaps lanes only on the even games (LAN-19)', () => {
    // Walk 1, 3, 5, 7 for games 1 to 4; games 2 and 4 take the other lane of the pair.
    expect(crossLanes(1, range(1, 16), 4, 'same')).toEqual([1, 4, 5, 8])
  })

  it('plays one game on the start lane (LAN-19)', () => {
    expect(crossLanes(7, range(1, 16), 1, 'staggered')).toEqual([7])
  })

  it('uses the last step of the four-game staggered cycle: skip 0 steps 2, not 0 (LAN-19)', () => {
    // Game 4 of the cycle is max(skip * 2, 2). With skip 0 that is 2, so the bowler still moves.
    expect(crossLanes(1, range(1, 16), 4, 'staggered')).toEqual([1, 4, 7, 10])
  })

  it('steps by twice the skip on the last game of the staggered cycle (LAN-19)', () => {
    // 40 lanes in use skip 3. Steps: game 2 is 8, game 3 is 10, game 4 is max(6, 2) = 6.
    // Raw lanes 1, 9, 19, 25; games 2 and 4 swap to the other lane of the pair.
    expect(crossLanes(1, range(1, 40), 4, 'staggered')).toEqual([1, 10, 19, 26])
  })

  it('wraps at the end of the lanes in use (LAN-19)', () => {
    expect(crossLanes(15, range(1, 16), 3, 'same')).toEqual([15, 2, 3])
  })

  it('keeps a lane when the other lane of its pair is not in use (LAN-19)', () => {
    // Five lanes in use: lane 5 has no partner (6), so game 2 stays on lane 5.
    expect(crossLanes(3, [1, 2, 3, 4, 5], 2, 'same')).toEqual([3, 5])
    expect(crossLanes(1, [1, 2, 3, 4, 5], 3, 'same')).toEqual([1, 4, 5])
  })

  it('throws for a start lane that is not in use', () => {
    expect(() => crossLanes(30, range(1, 16), 3, 'same')).toThrow(
      new RangeError('Lane 30 is not one of the lanes in use'),
    )
  })
})

describe('skipFor (LAN-18)', () => {
  it.each([
    [0, 0],
    [2, 0],
    [16, 0],
    [17, 1],
    [24, 1],
    [25, 2],
    [32, 2],
    [33, 3],
    [40, 3],
    [41, 4],
    [48, 4],
    [49, 5],
    [56, 5],
    [57, 6],
    [80, 6],
  ])('%i lanes in use skip %i', (laneCount, skip) => {
    expect(skipFor(laneCount)).toBe(skip)
  })
})

describe('lanesInUse (LAN-18)', () => {
  const pair = (firstLane: number, bowlers: number) => ({
    lanes: [firstLane, firstLane + 1],
    bowlers: Array.from({ length: bowlers }, () => ({})),
  })

  it('lists both lanes of every pair that holds a bowler, in lane order', () => {
    expect(lanesInUse([pair(1, 2), pair(3, 0), pair(5, 1)])).toEqual([1, 2, 5, 6])
  })

  it('sorts lanes even when the pairs arrive out of order', () => {
    expect(lanesInUse([pair(5, 1), pair(1, 1)])).toEqual([1, 2, 5, 6])
  })

  it('gives no lanes when no one is assigned', () => {
    expect(lanesInUse([pair(1, 0), pair(3, 0)])).toEqual([])
  })

  it('lists the one lane of a one-lane pair', () => {
    expect(lanesInUse([{ lanes: [9], bowlers: [{}] }])).toEqual([9])
  })
})
