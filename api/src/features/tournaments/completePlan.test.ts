import { describe, expect, it } from 'vitest'
import { alreadyCompleteMessage, noSquadMessage, planComplete } from './completePlan.ts'

describe('planComplete (TRN-10, D-257)', () => {
  it('lets an open tournament with a squad complete (TRN-39)', () => {
    expect(planComplete({ completed: false, squadCount: 3 })).toEqual({ kind: 'complete' })
  })

  it('refuses a tournament that is already complete (TRN-39)', () => {
    expect(planComplete({ completed: true, squadCount: 3 })).toEqual({
      kind: 'refused',
      errors: { tournament: alreadyCompleteMessage },
    })
    expect(alreadyCompleteMessage).toBe('This tournament is already complete')
  })

  it('refuses a tournament with no squad (TRN-39)', () => {
    expect(planComplete({ completed: false, squadCount: 0 })).toEqual({
      kind: 'refused',
      errors: { tournament: noSquadMessage },
    })
    expect(noSquadMessage).toBe('Add a squad before you complete this tournament')
  })

  it('lists every reason, the first one first (TRN-39)', () => {
    expect(planComplete({ completed: true, squadCount: 0 })).toEqual({
      kind: 'refused',
      errors: { tournament: `${alreadyCompleteMessage}\n${noSquadMessage}` },
    })
  })
})
