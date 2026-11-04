import { describe, expect, it } from 'vitest'
import {
  completedMessage,
  endBeforeStartMessage,
  gamesLockedMessage,
  planEdit,
  startDateLockedMessage,
  type EditState,
  type StoredTournament,
} from './editPlan.ts'
import { noEditFacts, type EditFacts } from './editFacts.ts'
import type { UpdateTournament } from './updateRequest.ts'

const stored: StoredTournament = {
  name: 'Spring Classic',
  startDate: '2027-03-12',
  endDate: '2027-03-14',
  bowlingCenter: 'Bowl-O-Rama',
  entryFee: 60,
  games: 5,
  finalsRatio: 8,
  cashRatio: 5,
  superSweeperCashRatio: 4,
  completed: false,
}

function state(
  overrides: { facts?: Partial<EditFacts>; completed?: boolean; rival?: boolean } = {},
): EditState {
  return {
    stored: { ...stored, completed: overrides.completed ?? false },
    facts: { ...noEditFacts, ...overrides.facts },
    hasRival: () => Promise.resolve(overrides.rival ?? false),
  }
}

const squadAt = (iso: string) => ({ kind: 'squad' as const, date: new Date(iso) })
const plan = (input: UpdateTournament, overrides?: Parameters<typeof state>[0]) =>
  planEdit(state(overrides), input)

describe('planEdit: what changes (TRN-24)', () => {
  it('keeps only the fields that differ from what is stored', async () => {
    expect(await plan({ name: 'Spring Classic', games: 5, entryFee: 65 })).toEqual({
      kind: 'save',
      changes: { entryFee: 65 },
    })
  })

  it('saves nothing for an empty body or for values already stored', async () => {
    expect(await plan({})).toEqual({ kind: 'save', changes: {} })
    expect(await plan({ name: stored.name, startDate: stored.startDate })).toEqual({
      kind: 'save',
      changes: {},
    })
  })

  it('counts a change of letter case in the name as a change', async () => {
    expect(await plan({ name: 'spring classic' })).toEqual({
      kind: 'save',
      changes: { name: 'spring classic' },
    })
  })

  it('lets a body that changes nothing through even on a complete tournament', async () => {
    expect(await plan({ name: stored.name }, { completed: true })).toEqual({
      kind: 'save',
      changes: {},
    })
  })
})

describe('planEdit: dates (TRN-02)', () => {
  it('refuses an end date before the stored start date', async () => {
    expect(await plan({ endDate: '2027-03-11' })).toEqual({
      kind: 'invalid',
      errors: { endDate: endBeforeStartMessage },
    })
  })

  it('refuses a start date after the stored end date', async () => {
    expect(await plan({ startDate: '2027-03-15' })).toEqual({
      kind: 'invalid',
      errors: { endDate: endBeforeStartMessage },
    })
  })

  it('accepts a one-day tournament', async () => {
    expect(await plan({ startDate: '2027-03-14' })).toMatchObject({ kind: 'save' })
  })

  it('checks the two dates together when both are sent', async () => {
    expect(await plan({ startDate: '2027-04-01', endDate: '2027-04-03' })).toMatchObject({
      kind: 'save',
    })
  })
})

describe('planEdit: a complete tournament is frozen (TRN-25, D-130)', () => {
  it('refuses every field that would change, name and center included', async () => {
    const result = await plan(
      { name: 'Renamed', bowlingCenter: 'Elsewhere', entryFee: 70, games: 6 },
      { completed: true },
    )

    expect(result).toEqual({
      kind: 'refused',
      errors: {
        name: completedMessage,
        bowlingCenter: completedMessage,
        entryFee: completedMessage,
        games: completedMessage,
      },
    })
  })

  it('does not name a field that did not change', async () => {
    const result = await plan({ name: stored.name, entryFee: 70 }, { completed: true })

    expect(result).toEqual({ kind: 'refused', errors: { entryFee: completedMessage } })
  })

  it('does not let confirmWarnings override it', async () => {
    const result = await plan({ entryFee: 70, confirmWarnings: true }, { completed: true })

    expect(result.kind).toBe('refused')
  })
})

describe('planEdit: games (TRN-25, D-128)', () => {
  it('is free until a score is saved', async () => {
    expect(await plan({ games: 6 }, { facts: { registrationCount: 40 } })).toEqual({
      kind: 'save',
      changes: { games: 6 },
    })
  })

  it('is refused once any score is saved', async () => {
    expect(await plan({ games: 6 }, { facts: { hasScores: true } })).toEqual({
      kind: 'refused',
      errors: { games: gamesLockedMessage },
    })
  })

  it('is not refused when the value is unchanged', async () => {
    expect(await plan({ games: 5 }, { facts: { hasScores: true } })).toEqual({
      kind: 'save',
      changes: {},
    })
  })
})

describe('planEdit: start date (TRN-25, TRN-26, D-128)', () => {
  it('is refused once any score is saved', async () => {
    expect(await plan({ startDate: '2027-03-11' }, { facts: { hasScores: true } })).toEqual({
      kind: 'refused',
      errors: { startDate: startDateLockedMessage },
    })
  })

  it('is refused when a squad falls before it, naming the squad', async () => {
    const result = await plan(
      { startDate: '2027-03-13' },
      { facts: { firstSession: squadAt('2027-03-12T09:00:00Z') } },
    )

    expect(result).toEqual({
      kind: 'refused',
      errors: {
        startDate:
          'Friday 9:00 AM squad is on 2027-03-12, before this start date. Move or remove it first.',
      },
    })
  })

  it('names a sweeper, and shows noon and midnight on a 12-hour clock', async () => {
    const noon = await plan(
      { startDate: '2027-03-13' },
      { facts: { firstSession: { kind: 'sweeper', date: new Date('2027-03-12T12:05:00Z') } } },
    )
    const midnight = await plan(
      { startDate: '2027-03-13' },
      { facts: { firstSession: squadAt('2027-03-12T00:30:00Z') } },
    )

    expect(noon).toMatchObject({
      errors: { startDate: expect.stringContaining('Friday 12:05 PM sweeper') as string },
    })
    expect(midnight).toMatchObject({
      errors: { startDate: expect.stringContaining('Friday 12:30 AM squad') as string },
    })
  })

  it('allows a squad on the new start day itself', async () => {
    const result = await plan(
      { startDate: '2027-03-12' },
      { facts: { firstSession: squadAt('2027-03-12T00:00:00Z') } },
    )

    expect(result.kind).toBe('save')
  })

  it('moving the start earlier is never blocked by a squad', async () => {
    const result = await plan(
      { startDate: '2027-03-10' },
      { facts: { firstSession: squadAt('2027-03-12T09:00:00Z') } },
    )

    expect(result).toEqual({ kind: 'save', changes: { startDate: '2027-03-10' } })
  })

  it('warns when bowlers are registered, with the count', async () => {
    const result = await plan({ startDate: '2027-03-13' }, { facts: { registrationCount: 38 } })

    expect(result).toEqual({
      kind: 'warn',
      warnings: [
        {
          field: 'startDate',
          message:
            '38 bowlers are registered. Ages are measured on the start date, so the change is not retroactive. Some bowlers may no longer fit their division. Review them by hand.',
        },
      ],
    })
  })

  it('says "1 bowler is registered" for one', async () => {
    const result = await plan({ startDate: '2027-03-13' }, { facts: { registrationCount: 1 } })

    expect(result).toMatchObject({
      warnings: [{ message: expect.stringMatching(/^1 bowler is registered\. /) as string }],
    })
  })

  it('is free with nobody registered', async () => {
    expect(await plan({ startDate: '2027-03-13' })).toMatchObject({ kind: 'save' })
  })
})

describe('planEdit: end date (TRN-25, D-128)', () => {
  it('is refused when a sweeper falls after it, naming the sweeper', async () => {
    const result = await plan(
      { endDate: '2027-03-13' },
      { facts: { lastSession: { kind: 'sweeper', date: new Date('2027-03-14T19:30:00Z') } } },
    )

    expect(result).toEqual({
      kind: 'refused',
      errors: {
        endDate:
          'Sunday 7:30 PM sweeper is on 2027-03-14, after this end date. Move or remove it first.',
      },
    })
  })

  it('allows a session on the new end day itself, at any hour', async () => {
    const result = await plan(
      { endDate: '2027-03-13' },
      { facts: { lastSession: squadAt('2027-03-13T23:59:00Z') } },
    )

    expect(result.kind).toBe('save')
  })

  it('is free to move later, with scores and registrations, and never warns', async () => {
    const result = await plan(
      { endDate: '2027-03-20' },
      {
        facts: {
          hasScores: true,
          registrationCount: 40,
          lastSession: squadAt('2027-03-14T09:00:00Z'),
        },
      },
    )

    expect(result).toEqual({ kind: 'save', changes: { endDate: '2027-03-20' } })
  })
})

describe('planEdit: entry fee (TRN-26, D-128)', () => {
  it('warns when bowlers are registered', async () => {
    expect(await plan({ entryFee: 75 }, { facts: { registrationCount: 38 } })).toEqual({
      kind: 'warn',
      warnings: [
        {
          field: 'entryFee',
          message:
            '38 bowlers are registered. They keep what they paid. New entries pay the new fee.',
        },
      ],
    })
  })

  it('is free with nobody registered, even with scores', async () => {
    expect(await plan({ entryFee: 75 }, { facts: { hasScores: true } })).toMatchObject({
      kind: 'save',
    })
  })

  it('does not warn when the fee is unchanged', async () => {
    expect(await plan({ entryFee: 60 }, { facts: { registrationCount: 38 } })).toEqual({
      kind: 'save',
      changes: {},
    })
  })
})

describe('planEdit: ratios (TRN-26, D-128)', () => {
  it.each(['finalsRatio', 'cashRatio'] as const)(
    '%s warns once a score is saved',
    async (field) => {
      expect(await plan({ [field]: 7 }, { facts: { hasScores: true } })).toEqual({
        kind: 'warn',
        warnings: [{ field, message: 'Scores are saved. Posted results change at once.' }],
      })
    },
  )

  it.each(['finalsRatio', 'cashRatio'] as const)('%s is free with no scores', async (field) => {
    expect(await plan({ [field]: 7 }, { facts: { registrationCount: 40 } })).toMatchObject({
      kind: 'save',
    })
  })

  it('the super sweeper ratio warns only for sweeper scores', async () => {
    const squadOnly = await plan({ superSweeperCashRatio: 6 }, { facts: { hasScores: true } })
    const sweeper = await plan(
      { superSweeperCashRatio: 6 },
      { facts: { hasScores: true, hasSweeperScores: true } },
    )

    expect(squadOnly.kind).toBe('save')
    expect(sweeper).toEqual({
      kind: 'warn',
      warnings: [
        {
          field: 'superSweeperCashRatio',
          message: 'Sweeper scores are saved. Posted results change at once.',
        },
      ],
    })
  })
})

describe('planEdit: name and center (TRN-24, D-128)', () => {
  it('are free with everything else in place', async () => {
    const result = await plan(
      { name: 'Renamed', bowlingCenter: 'Elsewhere' },
      { facts: { hasScores: true, hasSweeperScores: true, registrationCount: 40 } },
    )

    expect(result).toEqual({
      kind: 'save',
      changes: { name: 'Renamed', bowlingCenter: 'Elsewhere' },
    })
  })
})

describe('planEdit: duplicate (TRN-27, D-123)', () => {
  it('stops a name that another tournament holds on the same start date', async () => {
    expect(await plan({ name: 'Taken' }, { rival: true })).toEqual({ kind: 'duplicate' })
  })

  it('stops a start date that lands on another tournament with this name', async () => {
    expect(await plan({ startDate: '2027-03-13' }, { rival: true })).toEqual({
      kind: 'duplicate',
    })
  })

  it('asks about the name and start date the tournament would have', async () => {
    const asked: [string, string][] = []
    const spy: EditState = {
      ...state(),
      hasRival: (name, startDate) => {
        asked.push([name, startDate])
        return Promise.resolve(false)
      },
    }

    await planEdit(spy, { startDate: '2027-03-13' })
    await planEdit(spy, { name: 'Renamed' })

    expect(asked).toEqual([
      ['Spring Classic', '2027-03-13'],
      ['Renamed', '2027-03-12'],
    ])
  })

  it('does not ask when neither the name nor the start date changes', async () => {
    const spy: EditState = {
      ...state(),
      hasRival: () => Promise.reject(new Error('should not ask')),
    }

    expect(await planEdit(spy, { entryFee: 65, endDate: '2027-03-16' })).toMatchObject({
      kind: 'save',
    })
  })

  it('comes after the locks and before the warnings', async () => {
    const locked = await plan(
      { name: 'Taken', games: 6 },
      { rival: true, facts: { hasScores: true } },
    )
    const warned = await plan(
      { name: 'Taken', entryFee: 80 },
      { rival: true, facts: { registrationCount: 5 } },
    )

    expect(locked.kind).toBe('refused')
    expect(warned.kind).toBe('duplicate')
  })
})

describe('planEdit: warnings and confirmation (TRN-26, D-129)', () => {
  const busy = { registrationCount: 38, hasScores: true, hasSweeperScores: true }

  it('lists a warning for each changed field, in form order', async () => {
    const result = await plan(
      { superSweeperCashRatio: 6, cashRatio: 4, finalsRatio: 7, entryFee: 75 },
      { facts: busy },
    )

    expect(result.kind).toBe('warn')
    expect(result.kind === 'warn' && result.warnings.map((warning) => warning.field)).toEqual([
      'entryFee',
      'finalsRatio',
      'cashRatio',
      'superSweeperCashRatio',
    ])
  })

  it('puts the start date first when it warns too', async () => {
    const result = await plan(
      { entryFee: 75, startDate: '2027-03-13' },
      { facts: { registrationCount: 38 } },
    )

    expect(result.kind === 'warn' && result.warnings.map((warning) => warning.field)).toEqual([
      'startDate',
      'entryFee',
    ])
  })

  it('saves the whole change once confirmWarnings is true', async () => {
    const result = await plan(
      { entryFee: 75, cashRatio: 4, confirmWarnings: true },
      { facts: busy },
    )

    expect(result).toEqual({ kind: 'save', changes: { entryFee: 75, cashRatio: 4 } })
  })

  it('still asks when confirmWarnings is false', async () => {
    const result = await plan({ entryFee: 75, confirmWarnings: false }, { facts: busy })

    expect(result.kind).toBe('warn')
  })

  it('never lets confirmWarnings override a lock', async () => {
    const result = await plan({ games: 6, confirmWarnings: true }, { facts: busy })

    expect(result).toEqual({ kind: 'refused', errors: { games: gamesLockedMessage } })
  })

  it('reports every lock at once', async () => {
    const result = await plan({ games: 6, startDate: '2027-03-13' }, { facts: { hasScores: true } })

    expect(result).toEqual({
      kind: 'refused',
      errors: { games: gamesLockedMessage, startDate: startDateLockedMessage },
    })
  })
})
