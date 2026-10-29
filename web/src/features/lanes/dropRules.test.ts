import { describe, expect, it } from 'vitest'
import { createLaneBowler, createLanePair } from '../../mocks/data'
import {
  dropMessage,
  dropOutcome,
  NOT_BUILT,
  pairDropId,
  seatsLeft,
  unassignedDropId,
} from './dropRules'

const bowlers = (count: number) => Array.from({ length: count }, () => createLaneBowler())

describe('dropOutcome', () => {
  it('has room below capacity (D-58)', () => {
    expect(dropOutcome(createLanePair(1, bowlers(4), 5), 'new')).toBe('room')
  })

  it('has room on an empty pair', () => {
    expect(dropOutcome(createLanePair(1, [], 2), 'new')).toBe('room')
  })

  it('is full at capacity (D-56)', () => {
    expect(dropOutcome(createLanePair(1, bowlers(5), 5), 'new')).toBe('full')
  })

  it('is full over capacity, as a legacy pair can be (D-61)', () => {
    expect(dropOutcome(createLanePair(1, bowlers(3), 2), 'new')).toBe('full')
  })

  it('is the same pair for a bowler already in it, even when it is full (D-57)', () => {
    const inside = createLaneBowler()
    const pair = createLanePair(1, [inside, ...bowlers(4)], 5)

    expect(dropOutcome(pair, inside.registrationId)).toBe('same')
  })
})

describe('seatsLeft', () => {
  it.each([
    [0, 5, 5],
    [3, 5, 2],
    [5, 5, 0],
    [3, 2, 0],
  ])('%i bowlers on %i seats leaves %i', (count, capacity, expected) => {
    expect(seatsLeft(createLanePair(1, bowlers(count), capacity))).toBe(expected)
  })
})

describe('dropMessage', () => {
  const placed = createLaneBowler({ position: '1A' })
  const waiting = createLaneBowler()

  it('says the move is not built for a pair with room (D-55)', () => {
    expect(dropMessage(waiting, createLanePair(3, bowlers(2), 5))).toBe(NOT_BUILT)
    expect(NOT_BUILT).toBe('Lane assignment is not built yet. Nothing was saved.')
  })

  it('refuses a full pair and says how full it is (D-58)', () => {
    expect(dropMessage(waiting, createLanePair(1, bowlers(5), 5))).toBe(
      'Lanes 1-2 are full (5 of 5). Pick another pair.',
    )
  })

  it('names the lane pair it refused', () => {
    expect(dropMessage(waiting, createLanePair(11, bowlers(2), 2))).toBe(
      'Lanes 11-12 are full (2 of 2). Pick another pair.',
    )
  })

  it("says nothing for the bowler's own pair (D-57)", () => {
    expect(dropMessage(placed, createLanePair(1, [placed], 5))).toBeUndefined()
  })

  it('says the move is not built when a placed bowler goes back to unassigned (D-55)', () => {
    expect(dropMessage(placed, 'unassigned')).toBe(NOT_BUILT)
  })

  it('says nothing when an unassigned bowler is dropped on unassigned', () => {
    expect(dropMessage(waiting, 'unassigned')).toBeUndefined()
  })
})

describe('drop zone ids', () => {
  it('name a pair by its first lane, and the unassigned list', () => {
    expect(pairDropId({ firstLane: 13 })).toBe('pair-13')
    expect(unassignedDropId).toBe('unassigned')
  })
})
