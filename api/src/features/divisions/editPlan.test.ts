import { describe, expect, it } from 'vitest'
import { completeMessage, duplicateNameMessage, unusualPercentMessage } from './createPlan.ts'
import {
  eligibilityMessage,
  handicapScoresMessage,
  handicapSwitchMessage,
  planEdit,
  type DivisionEditState,
} from './editPlan.ts'
import type { Division } from './types.ts'

const stored: Division = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 1,
  name: 'Open',
  gender: null,
  minimumAge: null,
  maximumAge: null,
  minimumAverage: null,
  maximumAverage: null,
  handicapPercentage: 90,
  handicapBase: 220,
  maximumHandicapPerGame: 40,
}

const quiet: DivisionEditState = {
  tournamentCompleted: false,
  stored,
  facts: { registrationCount: 0, hasScores: false },
  otherNames: ['Women', 'Seniors'],
}

const withFacts = (facts: Partial<DivisionEditState['facts']>): DivisionEditState => ({
  ...quiet,
  facts: { ...quiet.facts, ...facts },
})

describe('planEdit', () => {
  it('saves only the fields that differ from what is stored (DIV-12)', () => {
    expect(planEdit(quiet, { name: 'Open', gender: 'Female' }, false)).toEqual({
      kind: 'save',
      changes: { gender: 'Female' },
    })
  })

  it('saves nothing when nothing differs (DIV-12)', () => {
    expect(planEdit(quiet, { name: 'Open', handicapBase: 220 }, false)).toEqual({
      kind: 'save',
      changes: {},
    })
    expect(planEdit(quiet, {}, false)).toEqual({ kind: 'save', changes: {} })
  })

  describe('a complete tournament (DIV-03, D-149)', () => {
    const complete = { ...quiet, tournamentCompleted: true }

    it('refuses any change, even the name', () => {
      expect(planEdit(complete, { name: 'Closed' }, false)).toEqual({
        kind: 'refused',
        errors: { tournament: completeMessage },
      })
    })

    it('refuses before the pair rules and before a confirm', () => {
      const facts = { ...complete, facts: { registrationCount: 5, hasScores: true } }
      expect(planEdit(facts, { minimumAge: 60, maximumAge: 50 }, true)).toEqual({
        kind: 'refused',
        errors: { tournament: completeMessage },
      })
    })

    it('lets a body that changes nothing through', () => {
      expect(planEdit(complete, { name: 'Open' }, false)).toEqual({ kind: 'save', changes: {} })
    })
  })

  describe('the name (DIV-02, DIV-15, D-140)', () => {
    it.each(['women', ' WOMEN ', 'Women'])('refuses %j, which another division uses', (name) => {
      expect(planEdit(quiet, { name: name.trim() }, false)).toEqual({
        kind: 'refused',
        errors: { name: duplicateNameMessage },
      })
    })

    it('allows a change of case to its own name', () => {
      expect(planEdit(quiet, { name: 'OPEN' }, false)).toEqual({
        kind: 'save',
        changes: { name: 'OPEN' },
      })
    })

    it('does not check a name that has not changed, since old rows may share names', () => {
      const old = { ...quiet, otherNames: ['Open'] }
      expect(planEdit(old, { name: 'Open', gender: 'Male' }, false)).toEqual({
        kind: 'save',
        changes: { gender: 'Male' },
      })
    })

    it('is free even with bowlers and scores (D-147)', () => {
      expect(
        planEdit(withFacts({ registrationCount: 9, hasScores: true }), { name: 'Main' }, false),
      ).toEqual({
        kind: 'save',
        changes: { name: 'Main' },
      })
    })
  })

  describe('the rules that compare fields run on the merged values (DIV-05, DIV-07, DIV-09, DIV-11)', () => {
    const aged: DivisionEditState = {
      ...quiet,
      stored: { ...stored, minimumAge: 40, maximumAge: 60 },
    }

    it('refuses a new maximum below the stored minimum, with a 400 plan', () => {
      expect(planEdit(aged, { maximumAge: 30 }, false)).toEqual({
        kind: 'invalid',
        errors: { minimumAge: 'Minimum age must be less than or equal to maximum age' },
      })
    })

    it('refuses averages the same way', () => {
      const averaged = { ...quiet, stored: { ...stored, minimumAverage: 150, maximumAverage: 200 } }
      expect(planEdit(averaged, { minimumAverage: 210 }, false)).toEqual({
        kind: 'invalid',
        errors: { minimumAverage: 'Minimum average must be less than or equal to maximum average' },
      })
    })

    it('lets equal limits pass', () => {
      expect(planEdit(aged, { maximumAge: 40 }, false)).toEqual({
        kind: 'save',
        changes: { maximumAge: 40 },
      })
    })

    it('does not block a name fix because of an odd stored pair', () => {
      const odd = { ...quiet, stored: { ...stored, minimumAge: 60, maximumAge: 40 } }
      expect(planEdit(odd, { name: 'Main' }, false)).toEqual({
        kind: 'save',
        changes: { name: 'Main' },
      })
    })

    it('requires the base when the percent is set on a scratch division', () => {
      const scratch = {
        ...quiet,
        stored: {
          ...stored,
          handicapPercentage: null,
          handicapBase: null,
          maximumHandicapPerGame: null,
        },
      }
      expect(planEdit(scratch, { handicapPercentage: 80 }, false)).toEqual({
        kind: 'invalid',
        errors: { handicapBase: 'Handicap base is required with a handicap percentage' },
      })
    })

    it('requires the percent when the base stays and the percent is cleared', () => {
      expect(planEdit(quiet, { handicapPercentage: null }, false)).toEqual({
        kind: 'invalid',
        errors: {
          handicapPercentage: 'Handicap percentage is required with a handicap base',
          maximumHandicapPerGame:
            'Maximum handicap per game is allowed only with a handicap percentage and base',
        },
      })
    })

    it('refuses a maximum per game without a percent and a base', () => {
      const scratch = {
        ...quiet,
        stored: {
          ...stored,
          handicapPercentage: null,
          handicapBase: null,
          maximumHandicapPerGame: null,
        },
      }
      expect(planEdit(scratch, { maximumHandicapPerGame: 30 }, false)).toEqual({
        kind: 'invalid',
        errors: {
          maximumHandicapPerGame:
            'Maximum handicap per game is allowed only with a handicap percentage and base',
        },
      })
    })

    it('refuses before it checks the name', () => {
      expect(planEdit(aged, { name: 'Women', maximumAge: 30 }, false).kind).toBe('invalid')
    })
  })

  describe('bowlers registered (D-12, D-147)', () => {
    const bowlers = withFacts({ registrationCount: 12 })

    it.each(['gender', 'minimumAge', 'maximumAge', 'minimumAverage', 'maximumAverage'] as const)(
      'warns with the count when %s changes',
      (field) => {
        const value = field === 'gender' ? 'Female' : 100
        expect(planEdit(bowlers, { [field]: value }, false)).toEqual({
          kind: 'warn',
          warnings: [{ field, message: eligibilityMessage(12) }],
        })
      },
    )

    it('says "1 bowler is registered" for one', () => {
      expect(eligibilityMessage(1)).toBe(
        '1 bowler is registered in this division. The change is not retroactive; review them by hand.',
      )
      expect(eligibilityMessage(12)).toBe(
        '12 bowlers are registered in this division. The change is not retroactive; review them by hand.',
      )
    })

    it('saves the same change once the director confirms', () => {
      expect(planEdit(bowlers, { gender: 'Female' }, true)).toEqual({
        kind: 'save',
        changes: { gender: 'Female' },
      })
    })

    it('does not warn for a value that did not change', () => {
      expect(planEdit(bowlers, { gender: null, minimumAge: null }, false)).toEqual({
        kind: 'save',
        changes: {},
      })
    })

    it('lists one warning per changed field, in form order', () => {
      const plan = planEdit(bowlers, { maximumAverage: 200, gender: 'Male', minimumAge: 20 }, false)
      expect(plan).toEqual({
        kind: 'warn',
        warnings: [
          { field: 'gender', message: eligibilityMessage(12) },
          { field: 'minimumAge', message: eligibilityMessage(12) },
          { field: 'maximumAverage', message: eligibilityMessage(12) },
        ],
      })
    })

    it('does not warn about handicap boxes that stay a handicap with no scores', () => {
      expect(planEdit(bowlers, { handicapBase: 200 }, false)).toEqual({
        kind: 'save',
        changes: { handicapBase: 200 },
      })
    })

    it('does not warn when nobody is registered', () => {
      expect(planEdit(quiet, { gender: 'Female', minimumAge: 20 }, false).kind).toBe('save')
    })
  })

  describe('scores saved for this division (D-147, D-148)', () => {
    const scored = withFacts({ hasScores: true })

    it.each([
      ['handicapPercentage', 85],
      ['handicapBase', 200],
      ['maximumHandicapPerGame', 30],
    ] as const)('warns that results change when %s changes', (field, value) => {
      expect(planEdit(scored, { [field]: value }, false)).toEqual({
        kind: 'warn',
        warnings: [{ field, message: handicapScoresMessage }],
      })
    })

    it('does not warn about the limits, which are not about scores', () => {
      expect(planEdit(scored, { gender: 'Female', minimumAge: 20 }, false).kind).toBe('save')
    })

    it('leaves the name free', () => {
      expect(planEdit(scored, { name: 'Main' }, false).kind).toBe('save')
    })

    it('saves once the director confirms', () => {
      expect(planEdit(scored, { handicapPercentage: 85 }, true)).toEqual({
        kind: 'save',
        changes: { handicapPercentage: 85 },
      })
    })
  })

  describe('scratch and handicap with bowlers registered (REG-05, D-147)', () => {
    const scratch: Division = {
      ...stored,
      handicapPercentage: null,
      handicapBase: null,
      maximumHandicapPerGame: null,
    }

    it('warns when a scratch division gets a percent', () => {
      const state = { ...quiet, stored: scratch, facts: { registrationCount: 3, hasScores: false } }
      expect(planEdit(state, { handicapPercentage: 80, handicapBase: 200 }, false)).toEqual({
        kind: 'warn',
        warnings: [{ field: 'handicapPercentage', message: handicapSwitchMessage(3) }],
      })
    })

    it('warns when a handicap division loses its percent', () => {
      const state = withFacts({ registrationCount: 3 })
      const plan = planEdit(
        state,
        { handicapPercentage: null, handicapBase: null, maximumHandicapPerGame: null },
        false,
      )
      expect(plan).toEqual({
        kind: 'warn',
        warnings: [{ field: 'handicapPercentage', message: handicapSwitchMessage(3) }],
      })
    })

    it('does not warn when the percent only changes value', () => {
      expect(
        planEdit(withFacts({ registrationCount: 3 }), { handicapPercentage: 80 }, false),
      ).toEqual({
        kind: 'save',
        changes: { handicapPercentage: 80 },
      })
    })

    it('is free with nobody registered', () => {
      const state = { ...quiet, stored: scratch }
      expect(planEdit(state, { handicapPercentage: 80, handicapBase: 200 }, false).kind).toBe(
        'save',
      )
    })

    it('joins both reasons on the percent when scores exist too', () => {
      const state = withFacts({ registrationCount: 3, hasScores: true })
      const plan = planEdit(
        state,
        { handicapPercentage: null, handicapBase: null, maximumHandicapPerGame: null },
        false,
      )
      expect(plan.kind).toBe('warn')
      if (plan.kind !== 'warn') return
      expect(plan.warnings[0]).toEqual({
        field: 'handicapPercentage',
        message: `${handicapScoresMessage} ${handicapSwitchMessage(3)}`,
      })
      expect(plan.warnings.map((warning) => warning.field)).toEqual([
        'handicapPercentage',
        'handicapBase',
        'maximumHandicapPerGame',
      ])
    })
  })

  describe('a percent above 100 (D-142)', () => {
    it('warns, with no bowlers or scores needed', () => {
      expect(planEdit(quiet, { handicapPercentage: 110 }, false)).toEqual({
        kind: 'warn',
        warnings: [{ field: 'handicapPercentage', message: unusualPercentMessage }],
      })
    })

    it('does not warn for 100', () => {
      expect(planEdit(quiet, { handicapPercentage: 100 }, false).kind).toBe('save')
    })

    it('does not warn again when a stored 110 stays', () => {
      const high = { ...quiet, stored: { ...stored, handicapPercentage: 110 } }
      expect(planEdit(high, { handicapPercentage: 110, name: 'Main' }, false).kind).toBe('save')
    })

    it('saves once confirmed', () => {
      expect(planEdit(quiet, { handicapPercentage: 110 }, true)).toEqual({
        kind: 'save',
        changes: { handicapPercentage: 110 },
      })
    })
  })
})
