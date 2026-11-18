import { describe, expect, it } from 'vitest'
import type { AverageCheck } from './inUse.ts'
import { completeMessage, planCheck, planRemove, type CheckFacts } from './savePlan.ts'

function facts(overrides: Partial<CheckFacts> = {}): CheckFacts {
  return {
    bowlerName: 'Bill Tran',
    tournamentComplete: false,
    handicap: true,
    providedAverage: 175,
    minimumAverage: null,
    maximumAverage: 190,
    scored: [],
    existing: undefined,
    ...overrides,
  }
}

const adjust = (average: unknown, note: unknown = 'USBC book', confirmWarnings?: boolean) => ({
  action: 'adjust' as const,
  average,
  note,
  confirmWarnings,
})

describe('planCheck verify (AVG-03)', () => {
  it('saves the provided average with no note (AVG-03)', () => {
    expect(planCheck(facts(), { action: 'verify' })).toEqual({
      kind: 'save',
      check: { providedAverage: 175, verifiedAverage: 175, note: null },
    })
  })

  it('cannot verify a bowler with no average (AVG-03, D-291)', () => {
    const plan = planCheck(facts({ providedAverage: null }), { action: 'verify' })
    expect(plan).toMatchObject({ kind: 'invalid', errors: { average: expect.any(String) } })
  })

  it('refuses a division with no handicap (AVG-02)', () => {
    expect(planCheck(facts({ handicap: false }), { action: 'verify' })).toMatchObject({
      kind: 'refused',
      status: 400,
    })
  })
})

describe('planCheck adjust (AVG-04, AVG-05)', () => {
  it('saves the new average with a trimmed note (AVG-04)', () => {
    expect(planCheck(facts(), adjust(182, '  USBC book  '))).toEqual({
      kind: 'save',
      check: { providedAverage: 175, verifiedAverage: 182, note: 'USBC book' },
    })
  })

  it('needs a note (AVG-04, D-291)', () => {
    for (const note of ['', '   ', null, 5]) {
      expect(planCheck(facts(), adjust(182, note))).toEqual({
        kind: 'invalid',
        errors: { note: 'Say why the average changed, or where it came from.' },
      })
    }
  })

  it('takes a note of 500 characters and refuses 501 (AVG-04)', () => {
    expect(planCheck(facts(), adjust(182, 'x'.repeat(500))).kind).toBe('save')
    expect(planCheck(facts(), adjust(182, 'x'.repeat(501)))).toMatchObject({
      kind: 'invalid',
      errors: { note: 'Note must be 500 characters or fewer.' },
    })
  })

  it('takes a whole average from 1 to 300 (AVG-04, REG-16)', () => {
    const open = facts({ maximumAverage: null })
    expect(planCheck(open, adjust(1)).kind).toBe('save')
    expect(planCheck(open, adjust(300)).kind).toBe('save')
    expect(planCheck(open, adjust(0))).toMatchObject({
      errors: { average: 'Average must be greater than 0.' },
    })
    expect(planCheck(open, adjust(301))).toMatchObject({
      errors: { average: 'Average must be less than or equal to 300.' },
    })
    expect(planCheck(open, adjust(180.5))).toMatchObject({
      errors: { average: 'Average must be a whole number.' },
    })
    expect(planCheck(open, adjust('180'))).toMatchObject({
      errors: { average: 'Average must be a whole number.' },
    })
  })

  it('refuses an average above the division maximum (AVG-05, D-291)', () => {
    expect(planCheck(facts(), adjust(191))).toEqual({
      kind: 'invalid',
      errors: {
        average:
          'The verified average is above the division limit. Move the bowler to another division.',
      },
    })
    expect(planCheck(facts(), adjust(190)).kind).toBe('save')
  })

  it('refuses an average below the division minimum (AVG-05, D-291)', () => {
    const limited = facts({ minimumAverage: 150 })
    expect(planCheck(limited, adjust(149))).toMatchObject({
      errors: {
        average:
          'The verified average is below the division limit. Move the bowler to another division.',
      },
    })
    expect(planCheck(limited, adjust(150)).kind).toBe('save')
  })

  it('reports the average and the note together (AVG-04)', () => {
    expect(planCheck(facts(), adjust(500, ''))).toMatchObject({
      errors: { average: expect.any(String), note: expect.any(String) },
    })
  })

  it('adjusts a bowler who gave no average (AVG-04, D-291)', () => {
    expect(planCheck(facts({ providedAverage: null }), adjust(160, 'League sheet'))).toEqual({
      kind: 'save',
      check: { providedAverage: null, verifiedAverage: 160, note: 'League sheet' },
    })
  })
})

describe('planCheck with scores (AVG-06, D-294)', () => {
  const scored = [{ complete: false }]

  it('asks to confirm a change of average when the bowler has scores (AVG-06)', () => {
    const plan = planCheck(facts({ scored }), adjust(182))
    expect(plan).toEqual({
      kind: 'confirm',
      warnings: [
        {
          field: 'average',
          message:
            'Bill Tran already has scores. A new average changes handicap, so results change.',
        },
      ],
    })
  })

  it('says payouts may be wrong when a scored session is complete (AVG-06)', () => {
    const plan = planCheck(
      facts({ scored: [{ complete: false }, { complete: true }] }),
      adjust(182),
    )
    expect(plan).toMatchObject({
      kind: 'confirm',
      warnings: [{ message: expect.stringContaining('Payouts already made may now be wrong.') }],
    })
  })

  it('saves once confirmed (AVG-06)', () => {
    expect(planCheck(facts({ scored }), adjust(182, 'USBC book', true)).kind).toBe('save')
  })

  it('does not warn when a verify keeps the average (AVG-06, D-294)', () => {
    expect(planCheck(facts({ scored }), { action: 'verify' }).kind).toBe('save')
  })

  it('warns when a verify moves an adjusted average back to the provided one (AVG-06)', () => {
    const existing: AverageCheck = { providedAverage: 175, verifiedAverage: 182, note: 'USBC book' }
    expect(planCheck(facts({ scored, existing }), { action: 'verify' }).kind).toBe('confirm')
  })

  it('does not warn when there are no scores (AVG-06)', () => {
    expect(planCheck(facts(), adjust(182)).kind).toBe('save')
  })
})

describe('a complete tournament (AVG-15, D-294)', () => {
  it('refuses every save with a 409', () => {
    const complete = facts({ tournamentComplete: true })
    for (const plan of [
      planCheck(complete, { action: 'verify' }),
      planCheck(complete, adjust(182)),
      planRemove(complete, true),
    ]) {
      expect(plan).toEqual({ kind: 'refused', status: 409, message: completeMessage })
    }
  })
})

describe('planRemove (AVG-07)', () => {
  const existing: AverageCheck = { providedAverage: 175, verifiedAverage: 182, note: 'USBC book' }

  it('removes a check (AVG-07)', () => {
    expect(planRemove(facts({ existing }), false)).toEqual({ kind: 'remove' })
  })

  it('refuses when there is nothing to remove (AVG-07)', () => {
    expect(planRemove(facts(), false)).toMatchObject({ kind: 'refused', status: 400 })
  })

  it('warns when scores exist and the average in use changes (AVG-06, AVG-07)', () => {
    const scored = [{ complete: false }]
    expect(planRemove(facts({ existing, scored }), false).kind).toBe('confirm')
    expect(planRemove(facts({ existing, scored }), true)).toEqual({ kind: 'remove' })
  })

  it('does not warn when removing a plain verify (AVG-07)', () => {
    const verified: AverageCheck = { providedAverage: 175, verifiedAverage: 175, note: null }
    expect(planRemove(facts({ existing: verified, scored: [{ complete: true }] }), false)).toEqual({
      kind: 'remove',
    })
  })
})
