import { describe, expect, it } from 'vitest'
import {
  noSessionEditFacts,
  resultsMessage,
  type SessionEditFacts,
} from '../../shared/sessionEdit.ts'
import { gamesLockedMessage, planSweeperEdit, type SweeperEditContext } from './updatePlan.ts'

const open = '11111111-1111-4111-8111-111111111111'
const women = '22222222-2222-4222-8222-222222222222'
const gone = '99999999-9999-4999-8999-999999999999'

const context = (
  over: Partial<Omit<SweeperEditContext, 'facts'>> & { facts?: Partial<SessionEditFacts> } = {},
): SweeperEditContext => ({
  tournament: { completed: false, startDate: '2026-10-23', endDate: '2026-10-25' },
  complete: false,
  stored: {
    date: '2026-10-23T19:00:00',
    startingLane: 11,
    numberOfLanes: 10,
    maxPerPair: 3,
    entryFee: 20,
    games: 3,
    cashRatio: 5,
    bonusPins: { [open]: 10 },
  },
  divisions: [
    { id: open, name: 'Open' },
    { id: women, name: 'Women' },
  ],
  ...over,
  facts: { ...noSessionEditFacts, ...over.facts },
})

describe('planSweeperEdit', () => {
  it('saves only what changes, free with nothing depending on it (D-180)', () => {
    expect(planSweeperEdit(context(), { games: 4, cashRatio: 5, entryFee: 25 }, false)).toEqual({
      kind: 'save',
      changes: { games: 4, entryFee: 25 },
    })
  })

  it('saves nothing when nothing changes, even for a complete sweeper (SQD-23)', () => {
    expect(
      planSweeperEdit(context({ complete: true }), { games: 3, bonusPins: { [open]: 10 } }, false),
    ).toEqual({ kind: 'save', changes: {} })
  })

  describe('bonus pins (SQD-29)', () => {
    it('keeps only the pins whose value changes; a missing pin counts as 0', () => {
      expect(planSweeperEdit(context(), { bonusPins: { [open]: 10, [women]: 6 } }, false)).toEqual({
        kind: 'save',
        changes: { bonusPins: { [women]: 6 } },
      })
      expect(planSweeperEdit(context(), { bonusPins: { [women]: 0 } }, false)).toEqual({
        kind: 'save',
        changes: {},
      })
    })

    it('treats a blank (0) on a stored pin as a removal', () => {
      expect(planSweeperEdit(context(), { bonusPins: { [open]: 0 } }, false)).toEqual({
        kind: 'save',
        changes: { bonusPins: { [open]: 0 } },
      })
    })

    it('refuses a division that is not the tournament, even at 0 (D-177)', () => {
      expect(planSweeperEdit(context(), { bonusPins: { [gone]: 0 } }, false)).toEqual({
        kind: 'refused',
        errors: { bonusPins: 'A division no longer exists. Reload the page' },
      })
    })

    it('warns about each pin that changes, by division, only with scores (D-180)', () => {
      const scored = context({ facts: { hasScores: true } })
      expect(planSweeperEdit(scored, { bonusPins: { [open]: 8, [women]: 6 } }, false)).toEqual({
        kind: 'warn',
        warnings: [
          {
            field: `bonusPins.${open}`,
            message: 'Open: scores are saved. Posted results change at once.',
          },
          {
            field: `bonusPins.${women}`,
            message: 'Women: scores are saved. Posted results change at once.',
          },
        ],
      })
      expect(planSweeperEdit(context(), { bonusPins: { [open]: 8 } }, false).kind).toBe('save')
    })
  })

  describe('refusals (SQD-24)', () => {
    it('refuses a complete tournament, then a complete sweeper (D-181)', () => {
      const frozen = context({
        tournament: { completed: true, startDate: '2026-10-23', endDate: '2026-10-25' },
        complete: true,
      })
      expect(planSweeperEdit(frozen, { games: 4 }, true)).toEqual({
        kind: 'refused',
        errors: { tournament: 'This tournament is complete and cannot be changed' },
      })
      expect(planSweeperEdit(context({ complete: true }), { games: 4 }, true)).toEqual({
        kind: 'refused',
        errors: { session: 'This sweeper is complete and cannot be changed' },
      })
    })

    it('refuses games once a score exists, even when confirmed (D-180)', () => {
      const scored = context({ facts: { hasScores: true } })
      expect(planSweeperEdit(scored, { games: 4 }, true)).toEqual({
        kind: 'refused',
        errors: { games: gamesLockedMessage },
      })
      expect(gamesLockedMessage).toBe('Scores are saved, so the number of games cannot change.')
    })

    it('lets games change while only other sessions have scores (D-180)', () => {
      expect(
        planSweeperEdit(context({ facts: { hasScores: false } }), { games: 4 }, false).kind,
      ).toBe('save')
    })

    it('does not refuse games when it did not change (D-17)', () => {
      const scored = context({ facts: { hasScores: true } })
      expect(planSweeperEdit(scored, { games: 3, entryFee: 25 }, false)).toMatchObject({
        kind: 'save',
        changes: { entryFee: 25 },
      })
    })

    it('refuses a date outside the tournament with the sweeper word (SQD-10)', () => {
      expect(planSweeperEdit(context(), { date: '2026-10-22T19:00:00' }, false)).toEqual({
        kind: 'refused',
        errors: { date: 'Sweeper date must be after tournament start' },
      })
    })

    it('refuses lanes that strand a bowler, with the other refusals together (D-182)', () => {
      const busy = context({ facts: { hasScores: true, assignedLanes: [11, 12, 12] } })
      expect(planSweeperEdit(busy, { startingLane: 13, games: 4 }, true)).toEqual({
        kind: 'refused',
        errors: {
          startingLane: 'Lane 11 has a bowler assigned. Move them first.',
          games: gamesLockedMessage,
        },
      })
    })

    it('answers invalid when the merged lanes pass lane 200 (D-179)', () => {
      expect(planSweeperEdit(context(), { startingLane: 199 }, false)).toEqual({
        kind: 'invalid',
        errors: { numberOfLanes: 'Lanes must end at lane 200 or lower' },
      })
    })
  })

  describe('warnings (SQD-25)', () => {
    it('warns about the fee and date with entries, and the cash ratio with scores, in form order', () => {
      const busy = context({ facts: { entryCount: 9, hasScores: true } })
      const sent = { cashRatio: 4, entryFee: 25, date: '2026-10-23T20:00:00' }
      const plan = planSweeperEdit(busy, sent, false)
      expect(plan.kind).toBe('warn')
      if (plan.kind === 'warn') {
        expect(plan.warnings.map((warning) => warning.field)).toEqual([
          'date',
          'entryFee',
          'cashRatio',
        ])
        expect(plan.warnings[2]?.message).toBe(resultsMessage)
      }
      expect(planSweeperEdit(busy, sent, true)).toEqual({ kind: 'save', changes: sent })
    })

    it('warns about the cash ratio only with scores, not with entries alone (D-180)', () => {
      expect(
        planSweeperEdit(context({ facts: { entryCount: 9 } }), { cashRatio: 4 }, false).kind,
      ).toBe('save')
    })
  })
})
