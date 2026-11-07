import { describe, expect, it } from 'vitest'
import {
  noSessionEditFacts,
  resultsMessage,
  type SessionEditFacts,
} from '../../shared/sessionEdit.ts'
import { planSquadEdit, type SquadEditContext } from './updatePlan.ts'

const context = (
  over: Partial<Omit<SquadEditContext, 'facts'>> & { facts?: Partial<SessionEditFacts> } = {},
): SquadEditContext => ({
  tournament: { completed: false, startDate: '2026-10-23', endDate: '2026-10-25' },
  complete: false,
  stored: {
    date: '2026-10-24T09:00:00',
    startingLane: 1,
    numberOfLanes: 20,
    maxPerPair: 4,
    entryFee: 60,
    finalsRatio: null,
    cashRatio: 4,
  },
  ...over,
  facts: { ...noSessionEditFacts, ...over.facts },
})

describe('planSquadEdit', () => {
  it('saves only the fields whose value changes, free with nothing depending on them (D-180)', () => {
    expect(
      planSquadEdit(context(), { date: '2026-10-24T13:00:00', maxPerPair: 4, entryFee: 75 }, false),
    ).toEqual({ kind: 'save', changes: { date: '2026-10-24T13:00:00', entryFee: 75 } })
  })

  it('saves nothing for a body that changes nothing, even on a complete squad (SQD-23)', () => {
    const complete = context({ complete: true })
    expect(planSquadEdit(complete, { maxPerPair: 4 }, false)).toEqual({ kind: 'save', changes: {} })
  })

  it('clears an override and counts it as a change (D-183)', () => {
    expect(planSquadEdit(context(), { entryFee: null }, false)).toEqual({
      kind: 'save',
      changes: { entryFee: null },
    })
    expect(planSquadEdit(context(), { finalsRatio: null }, false)).toEqual({
      kind: 'save',
      changes: {},
    })
  })

  describe('refusals (SQD-24)', () => {
    it('refuses every change of a complete tournament, naming the tournament (D-181)', () => {
      const frozen = context({
        tournament: { completed: true, startDate: '2026-10-23', endDate: '2026-10-25' },
      })
      expect(planSquadEdit(frozen, { entryFee: 70 }, true)).toEqual({
        kind: 'refused',
        errors: { tournament: 'This tournament is complete and cannot be changed' },
      })
    })

    it('refuses every change of a complete squad (SQD-17, D-181)', () => {
      expect(planSquadEdit(context({ complete: true }), { entryFee: 70 }, true)).toEqual({
        kind: 'refused',
        errors: { session: 'This squad is complete and cannot be changed' },
      })
    })

    it('refuses a date outside the tournament, even when confirmed (SQD-03)', () => {
      expect(planSquadEdit(context(), { date: '2026-10-26T09:00:00' }, true)).toEqual({
        kind: 'refused',
        errors: { date: 'Squad date must be before tournament end' },
      })
    })

    it('answers 400 when the merged lanes pass lane 200 (D-179)', () => {
      expect(planSquadEdit(context(), { startingLane: 195 }, false)).toEqual({
        kind: 'invalid',
        errors: { numberOfLanes: 'Lanes must end at lane 200 or lower' },
      })
    })

    it('refuses a change that strands a bowler, all reasons together (D-182)', () => {
      const busy = context({ facts: { assignedLanes: [1, 2, 1, 2, 15] } })
      expect(planSquadEdit(busy, { startingLane: 3, maxPerPair: 3 }, true)).toEqual({
        kind: 'refused',
        errors: {
          startingLane: 'Lane 1 has a bowler assigned. Move them first.',
          maxPerPair: 'Pair 1-2 holds 4 bowlers. Move them first.',
        },
      })
    })

    it('does not refuse a field that did not change, however full (D-17)', () => {
      const busy = context({ facts: { assignedLanes: [1, 1, 1, 1, 1, 1] } })
      expect(planSquadEdit(busy, { maxPerPair: 4, entryFee: 70 }, false)).toEqual({
        kind: 'save',
        changes: { entryFee: 70 },
      })
    })

    it('ignores scores in other squads: only this squad facts count (D-180)', () => {
      expect(
        planSquadEdit(context({ facts: { hasScores: false } }), { cashRatio: 3 }, false),
      ).toEqual({ kind: 'save', changes: { cashRatio: 3 } })
    })
  })

  describe('warnings (SQD-25)', () => {
    it('warns about the date and the fee with entries, in form order, then saves when confirmed', () => {
      const entered = context({ facts: { entryCount: 12 } })
      const sent = { entryFee: 75, date: '2026-10-24T13:00:00' }
      expect(planSquadEdit(entered, sent, false)).toEqual({
        kind: 'warn',
        warnings: [
          {
            field: 'date',
            message: '12 bowlers are entered. They planned around this time. Tell them.',
          },
          {
            field: 'entryFee',
            message:
              '12 bowlers are entered. They keep what they paid. New entries pay the new fee.',
          },
        ],
      })
      expect(planSquadEdit(entered, sent, true)).toEqual({ kind: 'save', changes: sent })
    })

    it('warns about the ratios only with scores in this squad (D-180)', () => {
      const scored = context({ facts: { hasScores: true } })
      expect(planSquadEdit(scored, { finalsRatio: 5, cashRatio: 3 }, false)).toEqual({
        kind: 'warn',
        warnings: [
          { field: 'finalsRatio', message: resultsMessage },
          { field: 'cashRatio', message: resultsMessage },
        ],
      })
      expect(planSquadEdit(context({ facts: { entryCount: 9 } }), { cashRatio: 3 }, false)).toEqual(
        {
          kind: 'save',
          changes: { cashRatio: 3 },
        },
      )
    })

    it('warns once about lanes with assignments that still fit (D-182)', () => {
      const placed = context({ facts: { assignedLanes: [1, 2, 3] } })
      const plan = planSquadEdit(placed, { numberOfLanes: 24, maxPerPair: 5 }, false)
      expect(plan.kind).toBe('warn')
      if (plan.kind === 'warn') {
        expect(plan.warnings.map((w) => w.field)).toEqual(['numberOfLanes'])
      }
    })

    it('never warns for a field whose value did not change', () => {
      const scored = context({ facts: { hasScores: true, entryCount: 5 } })
      expect(planSquadEdit(scored, { cashRatio: 4, entryFee: 60 }, false)).toEqual({
        kind: 'save',
        changes: {},
      })
    })

    it('lets a refusal win over a confirm (SQD-25)', () => {
      const both = context({ facts: { entryCount: 3, assignedLanes: [19] } })
      expect(planSquadEdit(both, { numberOfLanes: 10, entryFee: 70 }, true).kind).toBe('refused')
    })
  })
})
