import { describe, expect, it } from 'vitest'
import { createLaneBowler, createLanePair } from '../../mocks/data'
import {
  decideDrop,
  dropOutcome,
  NOT_SAVED,
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

describe('decideDrop', () => {
  const placed = createLaneBowler({ position: '1A' })
  const waiting = createLaneBowler()

  it('moves a bowler to a pair with room, to the first free seat (D-55, D-56)', () => {
    const pair = createLanePair(3, [createLaneBowler({ position: '3A' })], 5)

    expect(decideDrop(waiting, pair)).toEqual({
      type: 'move',
      move: { firstLane: 3, position: '4C' },
    })
  })

  it('refuses a full pair and says how full it is (D-58)', () => {
    expect(decideDrop(waiting, createLanePair(1, bowlers(5), 5))).toEqual({
      type: 'refuse',
      message: 'Lanes 1-2 are full (5 of 5). Pick another pair.',
    })
  })

  it('names the lane pair it refused', () => {
    expect(decideDrop(waiting, createLanePair(11, bowlers(2), 2))).toEqual({
      type: 'refuse',
      message: 'Lanes 11-12 are full (2 of 2). Pick another pair.',
    })
  })

  it("does nothing for the bowler's own pair (D-57)", () => {
    expect(decideDrop(placed, createLanePair(1, [placed], 5))).toEqual({ type: 'none' })
  })

  it('moves a placed bowler back to unassigned (D-57)', () => {
    expect(decideDrop(placed, 'unassigned')).toEqual({
      type: 'move',
      move: { firstLane: null, position: '' },
    })
  })

  it('does nothing when an unassigned bowler is dropped on unassigned', () => {
    expect(decideDrop(waiting, 'unassigned')).toEqual({ type: 'none' })
  })
})

describe('NOT_SAVED', () => {
  it('says the move shows on this screen only (D-55)', () => {
    expect(NOT_SAVED).toBe(
      'No save is configured yet. This move shows on this screen only and is lost on refresh.',
    )
  })
})

describe('drop zone ids', () => {
  it('name a pair by its first lane, and the unassigned list', () => {
    expect(pairDropId({ firstLane: 13 })).toBe('pair-13')
    expect(unassignedDropId).toBe('unassigned')
  })
})
