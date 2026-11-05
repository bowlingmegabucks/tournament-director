import { describe, expect, it } from 'vitest'
import {
  completeMessage,
  deleteWarningMessage,
  paidMessage,
  planDelete,
  scoresMessage,
  type DeleteFacts,
} from './deletePlan.ts'

const empty: DeleteFacts = {
  completed: false,
  hasScores: false,
  paidRegistrations: 0,
  registrations: 0,
  divisions: 0,
  squads: 0,
  sweepers: 0,
}

const facts = (overrides: Partial<DeleteFacts> = {}): DeleteFacts => ({ ...empty, ...overrides })

describe('planDelete', () => {
  it('deletes a tournament with nothing in it (TRN-34)', () => {
    expect(planDelete(empty, false)).toEqual({ kind: 'delete' })
  })

  it('warns when only divisions, squads, and sweepers exist (TRN-34, D-134)', () => {
    expect(planDelete(facts({ divisions: 4, squads: 3, sweepers: 1 }), false)).toMatchObject({
      kind: 'warn',
      counts: { registrations: 0, divisions: 4, squads: 3, sweepers: 1 },
    })
  })

  describe('refusals (TRN-33)', () => {
    it('words the complete and scores refusals as the API sends them', () => {
      expect(completeMessage).toBe('This tournament is complete and cannot be deleted.')
      expect(scoresMessage).toBe('Scores are saved, so this tournament cannot be deleted.')
    })

    it('refuses a complete tournament', () => {
      expect(planDelete(facts({ completed: true }), false)).toEqual({
        kind: 'refused',
        reasons: [completeMessage],
      })
    })

    it('refuses once any score exists', () => {
      expect(planDelete(facts({ hasScores: true }), false)).toEqual({
        kind: 'refused',
        reasons: [scoresMessage],
      })
    })

    it('refuses when a real payment exists, naming how many bowlers paid', () => {
      expect(planDelete(facts({ paidRegistrations: 3, registrations: 5 }), false)).toEqual({
        kind: 'refused',
        reasons: ['3 bowlers paid online. Remove their registrations first.'],
      })
    })

    it('uses the singular for one bowler who paid', () => {
      expect(paidMessage(1)).toBe('1 bowler paid online. Remove their registration first.')
    })

    it('reports every reason together, in the same order each time', () => {
      expect(
        planDelete(facts({ completed: true, hasScores: true, paidRegistrations: 2 }), false),
      ).toEqual({
        kind: 'refused',
        reasons: [completeMessage, scoresMessage, paidMessage(2)],
      })
    })

    it('does not let confirming override a refusal', () => {
      expect(planDelete(facts({ hasScores: true, registrations: 4 }), true)).toEqual({
        kind: 'refused',
        reasons: [scoresMessage],
      })
    })

    it('refuses before it warns', () => {
      const plan = planDelete(facts({ paidRegistrations: 1, registrations: 9 }), false)
      expect(plan.kind).toBe('refused')
    })
  })

  describe('the registrations warning (TRN-34)', () => {
    it('warns when registrations exist and the caller has not confirmed', () => {
      expect(
        planDelete(facts({ registrations: 12, divisions: 4, squads: 3, sweepers: 1 }), false),
      ).toEqual({
        kind: 'warn',
        warnings: [
          {
            field: 'tournament',
            message:
              '12 registrations, 4 divisions, 3 squads, and 1 sweeper will be deleted, with their lane assignments and payment records. The bowlers stay.',
          },
        ],
        counts: { registrations: 12, divisions: 4, squads: 3, sweepers: 1 },
      })
    })

    describe('confirming with the counts the caller saw (D-137)', () => {
      const held = { registrations: 12, divisions: 4, squads: 3, sweepers: 1 }
      const seen = (overrides: Partial<typeof held>) => ({ ...held, ...overrides })

      it('deletes when every count matches', () => {
        expect(planDelete(facts(held), true, held)).toEqual({ kind: 'delete' })
      })

      it.each(['registrations', 'divisions', 'squads', 'sweepers'] as const)(
        'warns again when the %s count moved',
        (name) => {
          expect(planDelete(facts(held), true, seen({ [name]: held[name] - 1 }))).toMatchObject({
            kind: 'warn',
            counts: held,
          })
        },
      )

      it('does not let a matching count override a refusal', () => {
        expect(planDelete(facts({ ...held, hasScores: true }), true, held).kind).toBe('refused')
      })
    })

    it('deletes when the caller confirmed', () => {
      expect(planDelete(facts({ registrations: 12, divisions: 4 }), true)).toEqual({
        kind: 'delete',
      })
    })

    it('leaves out the parts that are empty and uses singular for one', () => {
      expect(deleteWarningMessage(facts({ registrations: 1, divisions: 1 }))).toBe(
        '1 registration and 1 division will be deleted, with their lane assignments and payment records. The bowlers stay.',
      )
    })

    it('leaves out registrations when there are none', () => {
      expect(deleteWarningMessage(facts({ divisions: 2 }))).toBe(
        '2 divisions will be deleted, with their lane assignments and payment records. The bowlers stay.',
      )
    })

    it('uses the singular for one of each', () => {
      expect(
        deleteWarningMessage(facts({ registrations: 1, divisions: 1, squads: 1, sweepers: 1 })),
      ).toBe(
        '1 registration, 1 division, 1 squad, and 1 sweeper will be deleted, with their lane assignments and payment records. The bowlers stay.',
      )
    })

    it('names a lone part without "and"', () => {
      expect(deleteWarningMessage(facts({ registrations: 2 }))).toBe(
        '2 registrations will be deleted, with their lane assignments and payment records. The bowlers stay.',
      )
    })

    it('joins three parts with commas and a final "and"', () => {
      expect(deleteWarningMessage(facts({ registrations: 2, divisions: 3, sweepers: 2 }))).toBe(
        '2 registrations, 3 divisions, and 2 sweepers will be deleted, with their lane assignments and payment records. The bowlers stay.',
      )
    })
  })
})
