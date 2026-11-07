import { describe, expect, it } from 'vitest'
import { bowlersEntered, noteIds, sharedNotes, type SessionEditInfo } from './sessionEdit'

const none: SessionEditInfo = {
  entryCount: 0,
  assignmentCount: 0,
  hasScores: false,
  lowestAssignedLane: null,
  highestAssignedLane: null,
  fullestPair: null,
}

describe('sharedNotes (SQD-27, D-180, D-182)', () => {
  it('has no notes when nothing depends on the session', () => {
    expect(sharedNotes(none)).toEqual({})
  })

  it('asks to confirm the date and the fee with entries, with the count', () => {
    const notes = sharedNotes({ ...none, entryCount: 12 })
    expect(notes['date']).toEqual({
      confirm: '12 bowlers are entered. They planned around this time. Tell them.',
    })
    expect(notes['entryFee']).toEqual({
      confirm: '12 bowlers are entered. They keep what they paid. New entries pay the new fee.',
    })
    expect(notes['startingLane']).toBeUndefined()
  })

  it('says one bowler, not 1 bowlers', () => {
    expect(bowlersEntered(1)).toBe('1 bowler is entered.')
    expect(sharedNotes({ ...none, entryCount: 1 })['date']?.confirm).toMatch(
      /^1 bowler is entered\./,
    )
  })

  it('limits the lanes and asks to confirm with assignments', () => {
    const notes = sharedNotes({
      ...none,
      assignmentCount: 12,
      lowestAssignedLane: 1,
      highestAssignedLane: 18,
      fullestPair: 4,
    })
    const confirm =
      '12 bowlers have lane assignments. They keep their lanes, but recap sheets use the lanes and bowlers per pair, so check them.'
    expect(notes['startingLane']).toEqual({
      limit: 'Lanes 1 to 18 have bowlers assigned, so the range must keep them.',
      confirm,
    })
    expect(notes['numberOfLanes']).toEqual(notes['startingLane'])
    expect(notes['maxPerPair']).toEqual({
      confirm,
      limit: 'The fullest pair holds 4 bowlers, so this cannot go below 4.',
    })
  })

  it('names the lane and the bowler when only one is assigned', () => {
    const notes = sharedNotes({
      ...none,
      assignmentCount: 1,
      lowestAssignedLane: 7,
      highestAssignedLane: 7,
      fullestPair: 1,
    })
    expect(notes['startingLane']?.limit).toBe(
      'Lane 7 has a bowler assigned, so the range must keep it.',
    )
    expect(notes['startingLane']?.confirm).toMatch(/^1 bowler has a lane assignment\./)
    expect(notes['maxPerPair']?.limit).toBe(
      'The fullest pair holds 1 bowler, so this cannot go below 1.',
    )
  })
})

describe('noteIds', () => {
  it('lists the ids of the lines a note has, in reading order', () => {
    expect(noteIds('x', { limit: 'a', lock: 'b', confirm: 'c' })).toEqual([
      'x-limit',
      'x-lock',
      'x-confirm',
    ])
    expect(noteIds('x', { confirm: 'c' })).toEqual([undefined, undefined, 'x-confirm'])
    expect(noteIds('x', undefined)).toEqual([undefined, undefined, undefined])
  })
})
