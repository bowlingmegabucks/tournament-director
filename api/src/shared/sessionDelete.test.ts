import { describe, expect, it } from 'vitest'
import {
  applySessionDelete,
  enteredMessage,
  noSessionDeleteInfo,
  planSessionDelete,
  scoresMessage,
  sessionCompleteDeleteMessage,
  type SessionDeleteFacts,
} from './sessionDelete.ts'

const open: SessionDeleteFacts = {
  completed: false,
  complete: false,
  entryCount: 0,
  scoreCount: 0,
}

describe('planSessionDelete (SQD-14, D-186)', () => {
  it('deletes a session nothing depends on, the last one of a tournament included', () => {
    expect(planSessionDelete(open, 'squad')).toEqual({ kind: 'delete' })
    expect(planSessionDelete(open, 'sweeper')).toEqual({ kind: 'delete' })
  })

  it('refuses a complete tournament (D-130)', () => {
    expect(planSessionDelete({ ...open, completed: true }, 'squad')).toEqual({
      kind: 'refused',
      errors: { tournament: 'This tournament is complete and cannot be changed' },
    })
  })

  it('refuses a complete session and names its kind (SQD-17, SQD-18, D-10)', () => {
    expect(planSessionDelete({ ...open, complete: true }, 'squad')).toEqual({
      kind: 'refused',
      errors: { session: 'This squad is complete and cannot be deleted.' },
    })
    expect(sessionCompleteDeleteMessage('sweeper')).toBe(
      'This sweeper is complete and cannot be deleted.',
    )
  })

  it('refuses entered bowlers, one or many, and tells the director how to go on (D-186)', () => {
    expect(enteredMessage('squad', 12)).toBe(
      '12 bowlers are entered in this squad. Remove them from the squad first.',
    )
    expect(enteredMessage('sweeper', 1)).toBe(
      '1 bowler is entered in this sweeper. Remove them from the sweeper first.',
    )
    expect(planSessionDelete({ ...open, entryCount: 2 }, 'squad')).toEqual({
      kind: 'refused',
      errors: {
        entries: '2 bowlers are entered in this squad. Remove them from the squad first.',
      },
    })
  })

  it('refuses saved scores (D-186)', () => {
    expect(scoresMessage('sweeper')).toBe(
      'Scores are saved for this sweeper, so it cannot be deleted.',
    )
    expect(planSessionDelete({ ...open, scoreCount: 1 }, 'sweeper')).toEqual({
      kind: 'refused',
      errors: { scores: 'Scores are saved for this sweeper, so it cannot be deleted.' },
    })
  })

  it('lists every reason, the tournament first (D-186)', () => {
    const plan = planSessionDelete(
      { completed: true, complete: true, entryCount: 3, scoreCount: 9 },
      'squad',
    )

    expect(plan.kind).toBe('refused')
    if (plan.kind !== 'refused') return
    expect(Object.keys(plan.errors)).toEqual(['tournament', 'session', 'entries', 'scores'])
  })
})

describe('applySessionDelete (D-189)', () => {
  it('stores nothing when refused', async () => {
    let persisted = false
    const outcome = await applySessionDelete({ ...open, entryCount: 1 }, 'squad', () => {
      persisted = true
      return Promise.resolve()
    })

    expect('refused' in outcome).toBe(true)
    expect(persisted).toBe(false)
  })

  it('stores once and answers deleted when the plan allows it', async () => {
    let persisted = 0
    const outcome = await applySessionDelete(open, 'squad', () => {
      persisted += 1
      return Promise.resolve()
    })

    expect(outcome).toEqual({ deleted: true })
    expect(persisted).toBe(1)
  })
})

describe('noSessionDeleteInfo', () => {
  it('starts at zero and takes what a test gives', () => {
    expect(noSessionDeleteInfo()).toEqual({ entryCount: 0, scoreCount: 0 })
    expect(noSessionDeleteInfo({ entryCount: 4 })).toEqual({ entryCount: 4, scoreCount: 0 })
  })
})
