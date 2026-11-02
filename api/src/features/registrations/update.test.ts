import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createDivision, createSweeper, createTournament } from '../../test/factories.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import type { Division } from '../divisions/types.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { isPaidRequest } from './payment.ts'
import { updateRegistration } from './update.ts'
import { parseUpdateRequest, type UpdateInput } from './updateRequest.ts'
import {
  createInMemoryRegistrationWriter,
  type InMemoryWriterSeed,
  type StoredSession,
} from './writer.ts'

const now = new Date('2026-10-01T12:00:00Z')

const session = (kind: 'squad' | 'sweeper', tournamentId: string, complete = false) =>
  ({ id: faker.string.uuid(), tournamentId, kind, complete }) satisfies StoredSession

const paid = { processingSystem: 'Stripe', confirmationCode: 'ch_1', amount: 50 }

interface Options {
  division?: Partial<Division>
  /** Squad and sweeper flags for the sessions the bowler starts on. */
  completeSquad?: boolean
  superSweeper?: boolean
  scoredOn?: ('squad' | 'sweeper')[]
  /** The tournament has a second sweeper the bowler is not on. */
  secondSweeper?: boolean
}

/**
 * A bowler registered on squad 1 (and the one sweeper) in an open division. Squad 2 and a second
 * division are free to add.
 */
function setup(options: Options = {}) {
  const tournament = createTournament({ startDate: '2026-10-23' })
  const division = createDivision(options.division)
  const otherDivision = createDivision()
  const squad = session('squad', tournament.id, options.completeSquad)
  const secondSquad = session('squad', tournament.id)
  const sweeper = session('sweeper', tournament.id)
  const extraSweeper = session('sweeper', tournament.id)
  const bowler = createCommonBowler()
  const registrationId = faker.string.uuid()
  const scores = (options.scoredOn ?? []).map((kind) => ({
    bowlerId: bowler.id,
    sessionId: kind === 'squad' ? squad.id : sweeper.id,
  }))
  const seed: InMemoryWriterSeed = {
    bowlers: [bowler],
    divisions: [
      { id: division.id, tournamentId: tournament.id },
      { id: otherDivision.id, tournamentId: tournament.id },
    ],
    sessions: [squad, secondSquad, sweeper, ...(options.secondSweeper ? [extraSweeper] : [])],
    registrations: [
      {
        tournamentId: tournament.id,
        registration: {
          id: registrationId,
          bowlerId: bowler.id,
          divisionId: division.id,
          average: 185,
          superSweeper: options.superSweeper ?? false,
          sessionIds: [squad.id, sweeper.id],
        },
      },
    ],
    scores,
  }
  const { writer, state } = createInMemoryRegistrationWriter(seed)
  const deps = {
    tournaments: createInMemoryTournamentRepository([tournament]),
    divisions: createInMemoryDivisionRepository([
      { tournamentId: tournament.id, division },
      { tournamentId: tournament.id, division: otherDivision },
    ]),
    sweepers: createInMemorySweeperRepository(
      [sweeper, ...(options.secondSweeper ? [extraSweeper] : [])].map((entry) => ({
        tournamentId: tournament.id,
        sweeper: createSweeper({ id: entry.id }),
      })),
    ),
    writer,
    now: () => now,
  }
  function input(changes: Record<string, unknown> = {}): UpdateInput {
    const parsed = parseUpdateRequest({ registration: { registrationId, ...changes } })
    if (!parsed.success) throw new Error(`bad test input: ${JSON.stringify(parsed.failures)}`)
    return parsed.data.registration
  }
  const stored = () => state.registrations[0]?.registration
  return {
    deps,
    state,
    stored,
    input,
    registrationId,
    squad,
    secondSquad,
    sweeper,
    extraSweeper,
    division,
    otherDivision,
    tournament,
  }
}

async function failuresOf(result: ReturnType<typeof updateRegistration>) {
  const outcome = await result
  if (outcome.ok) throw new Error('expected a failure')
  return outcome.failures
}

describe('isPaidRequest (D-106)', () => {
  it.each([
    [{ processingSystem: 'Stripe', confirmationCode: 'a', amount: 1 }, true],
    [{ processingSystem: 'Manual', confirmationCode: 'a', amount: 25 }, false],
    [{ processingSystem: 'Stripe', confirmationCode: 'a', amount: 0 }, false],
    [null, false],
    [undefined, false],
  ])('%j is %s', (payment, expected) => {
    expect(isPaidRequest(payment)).toBe(expected)
  })
})

describe('request shape (API-07)', () => {
  it('needs a registration id that is a UUID', () => {
    const parsed = parseUpdateRequest({ registration: { registrationId: 'nope' } })

    expect(parsed).toMatchObject({ success: false })
    expect(!parsed.success && parsed.failures).toEqual([
      expect.objectContaining({
        code: 'Registration.IdInvalid',
        description: 'Invalid Registration ID',
      }),
    ])
  })

  it('names each bad list and the payment', () => {
    const parsed = parseUpdateRequest({
      registration: {
        registrationId: faker.string.uuid(),
        squadIds: ['x'],
        sweeperIds: ['y'],
        payment: { processingSystem: 'Stripe', confirmationCode: 'a', amount: 5000 },
      },
    })

    expect(!parsed.success && parsed.failures.map((f) => [f.code, f.description])).toEqual([
      ['Registration.SquadIdsInvalid', 'Invalid squad IDs'],
      ['Registration.SweeperIdsInvalid', 'Invalid sweeper IDs'],
      ['Payment.Invalid', 'The payment is not valid.'],
    ])
  })

  it('answers a missing body with a general failure', () => {
    const parsed = parseUpdateRequest(undefined)

    expect(!parsed.success && parsed.failures[0]?.code).toBe('Registration.Required')
  })
})

describe('updating a registration (API-07)', () => {
  it('changes nothing when nothing is sent, and leaves the bowler alone (REG-31)', async () => {
    const { deps, input, stored, state, squad, sweeper } = setup()
    const bowlerBefore = { ...state.bowlers[0] }

    const result = await updateRegistration(deps, input().registrationId, input())

    expect(result).toEqual({ ok: true, mode: 'update' })
    expect(stored()).toMatchObject({ average: 185, sessionIds: [squad.id, sweeper.id] })
    expect(state.bowlers[0]).toEqual(bowlerBefore)
  })

  it('reports an unknown registration as a failure that is not a validation error (REG-30, API-12)', async () => {
    const { deps, input } = setup()
    const id = faker.string.uuid()

    const failures = await failuresOf(updateRegistration(deps, id, input()))

    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'other',
        code: 'Registration.NotFound',
        description: `Registration with ID ${id} not found.`,
      }),
    ])
  })
})

describe('missing records', () => {
  it('reports a tournament that is gone as a failure that is not a validation error', async () => {
    const { deps, input, registrationId } = setup()
    const empty = { ...deps, tournaments: createInMemoryTournamentRepository([]) }

    const failures = await failuresOf(updateRegistration(empty, registrationId, input()))

    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'other',
        code: 'Tournament.NotFound',
        description: 'The specified tournament does not exist.',
      }),
    ])
  })

  it('reports a division the writer knows but the division list does not', async () => {
    const { deps, input, registrationId, tournament } = setup()
    const hidden = createDivision()
    deps.writer.findDivisionTournament = () => Promise.resolve(tournament.id)
    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ divisionId: hidden.id })),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'other',
        code: 'Division.NotFound',
        description: 'The specified division does not exist.',
      }),
    ])
  })
})

describe('squad and sweeper lists (REG-31 to REG-35)', () => {
  it('replaces the squads and keeps the sweepers when only squadIds is sent (REG-31)', async () => {
    const { deps, input, stored, secondSquad, sweeper, registrationId } = setup()

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ squadIds: [secondSquad.id] }),
    )

    expect(result.ok).toBe(true)
    expect(stored()?.sessionIds).toEqual([sweeper.id, secondSquad.id])
  })

  it('keeps the squads and empties the sweepers when sweeperIds is empty (REG-31)', async () => {
    const { deps, input, stored, squad, registrationId } = setup()

    await updateRegistration(deps, registrationId, input({ sweeperIds: [] }))

    expect(stored()?.sessionIds).toEqual([squad.id])
  })

  it('adds a squad without a duplicate when the list repeats an id (REG-31)', async () => {
    const { deps, input, stored, squad, secondSquad, sweeper, registrationId } = setup()

    await updateRegistration(
      deps,
      registrationId,
      input({ squadIds: [squad.id, secondSquad.id, secondSquad.id] }),
    )

    expect(stored()?.sessionIds).toEqual([squad.id, sweeper.id, secondSquad.id])
  })

  it('rejects ids that are not squads of the tournament (REG-32)', async () => {
    const { deps, input, registrationId, state } = setup()
    const stranger = session('squad', faker.string.uuid())
    state.sessions.push(stranger)

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ squadIds: [stranger.id] })),
    )

    expect(failures).toContainEqual(
      expect.objectContaining({
        code: 'Registration.InvalidSquadIds',
        description: 'Invalid squad IDs',
      }),
    )
  })

  it('rejects a sweeper id that is a squad (REG-32)', async () => {
    const { deps, input, registrationId, secondSquad } = setup()

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ sweeperIds: [secondSquad.id] })),
    )

    expect(failures.map((f) => f.code)).toContain('Registration.InvalidSweeperIds')
  })

  it('rejects adding a complete squad (REG-33)', async () => {
    const { deps, input, registrationId, secondSquad, state } = setup()
    const done = state.sessions.find((s) => s.id === secondSquad.id)
    if (done) done.complete = true

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ squadIds: [secondSquad.id] })),
    )

    expect(failures.map((f) => f.description)).toContain(
      'Cannot add squad(s) that are already complete.',
    )
  })

  it('keeps a complete squad the bowler is already on (REG-33)', async () => {
    const { deps, input, registrationId, squad } = setup({ completeSquad: true })

    const result = await updateRegistration(deps, registrationId, input({ squadIds: [squad.id] }))

    expect(result.ok).toBe(true)
  })

  it('refuses to remove a squad where the bowler has scores, for a paid request too (REG-34)', async () => {
    const { deps, input, registrationId, secondSquad } = setup({ scoredOn: ['squad'] })

    const failures = await failuresOf(
      updateRegistration(
        deps,
        registrationId,
        input({ squadIds: [secondSquad.id], payment: paid }),
      ),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'validation',
        code: 'Registration.RemovedSessionHasScores',
        description: 'Bowler has already bowled in removed squads.',
      }),
    ])
  })

  it('refuses to remove a sweeper where the bowler has scores (REG-34)', async () => {
    const { deps, input, registrationId } = setup({ scoredOn: ['sweeper'] })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ sweeperIds: [] })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Registration.RemovedSessionHasScores'])
  })

  it('refuses a desk request that removes a complete squad (D-10)', async () => {
    const { deps, input, registrationId, secondSquad } = setup({ completeSquad: true })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ squadIds: [secondSquad.id] })),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        code: 'Registration.RemovedSessionComplete',
        description: 'Cannot remove a squad or sweeper that is already complete.',
      }),
    ])
  })

  it('lets a paid request remove a complete squad that has no scores (D-106, REG-34)', async () => {
    const { deps, input, registrationId, secondSquad, squad, stored } = setup({
      completeSquad: true,
    })

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ squadIds: [secondSquad.id], payment: paid }),
    )

    expect(result.ok).toBe(true)
    expect(stored()?.sessionIds).not.toContain(squad.id)
  })

  it('refuses a desk request that leaves no squad (D-04)', async () => {
    const { deps, input, registrationId } = setup()

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ squadIds: [] })),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'validation',
        code: 'Registration.SquadsRequired',
        description: 'Bowler must enter at least one squad',
      }),
    ])
  })

  it('lets a paid request leave no squad, as legacy does (D-106)', async () => {
    const { deps, input, registrationId, stored, sweeper } = setup()

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ squadIds: [], payment: paid }),
    )

    expect(result.ok).toBe(true)
    expect(stored()?.sessionIds).toEqual([sweeper.id])
  })

  it('treats a Manual payment as a desk request (D-106, PAY-01a)', async () => {
    const { deps, input, registrationId } = setup()
    const manual = { processingSystem: 'Manual', confirmationCode: 'desk1', amount: 0 }

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ squadIds: [], payment: manual })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Registration.SquadsRequired'])
  })

  it('reports every failure at once', async () => {
    const { deps, input, registrationId } = setup()

    const failures = await failuresOf(
      updateRegistration(
        deps,
        registrationId,
        input({ squadIds: [], superSweeper: true, sweeperIds: [] }),
      ),
    )

    expect(failures.map((f) => f.code)).toEqual([
      'Registration.SquadsRequired',
      'Registration.SuperSweeperNeedsAllSweepers',
    ])
  })
})

describe('super sweeper (REG-35, REG-36, D-110)', () => {
  it('turns it on when the bowler has every sweeper (REG-35)', async () => {
    const { deps, input, registrationId, stored } = setup()

    const result = await updateRegistration(deps, registrationId, input({ superSweeper: true }))

    expect(result.ok).toBe(true)
    expect(stored()?.superSweeper).toBe(true)
  })

  it('refuses it when a sweeper is missing from the new list (REG-35)', async () => {
    const { deps, input, registrationId } = setup()

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ superSweeper: true, sweeperIds: [] })),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        code: 'Registration.SuperSweeperNeedsAllSweepers',
        description: 'Super Sweeper cannot be enrolled when not all sweepers are registered.',
      }),
    ])
  })

  it('refuses dropping a sweeper while super sweeper stays on (REG-35)', async () => {
    const { deps, input, registrationId } = setup({ superSweeper: true })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ sweeperIds: [] })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Registration.SuperSweeperNeedsAllSweepers'])
  })

  it('refuses it when only some of the tournament sweepers are on the list (REG-35)', async () => {
    const { deps, input, registrationId } = setup({ secondSweeper: true })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ superSweeper: true })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Registration.SuperSweeperNeedsAllSweepers'])
  })

  it('accepts it when the list holds every sweeper (REG-35)', async () => {
    const { deps, input, registrationId, sweeper, extraSweeper } = setup({ secondSweeper: true })

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ superSweeper: true, sweeperIds: [sweeper.id, extraSweeper.id] }),
    )

    expect(result.ok).toBe(true)
  })

  it('lets it stay on when the request repeats the value (REG-36)', async () => {
    const { deps, input, registrationId } = setup({ superSweeper: true, scoredOn: ['sweeper'] })

    const result = await updateRegistration(deps, registrationId, input({ superSweeper: true }))

    expect(result.ok).toBe(true)
  })

  it('refuses a change once this bowler has a sweeper score, paid or not (REG-36, D-110)', async () => {
    const { deps, input, registrationId } = setup({ superSweeper: true, scoredOn: ['sweeper'] })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ superSweeper: false, payment: paid })),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        code: 'Registration.SuperSweeperLocked',
        description: 'Cannot change Super Sweeper when sweeper scores have been recorded.',
      }),
    ])
  })

  it('ignores a squad score when it checks the lock (REG-36)', async () => {
    const { deps, input, registrationId, stored } = setup({ scoredOn: ['squad'] })

    const result = await updateRegistration(deps, registrationId, input({ superSweeper: true }))

    expect(result.ok).toBe(true)
    expect(stored()?.superSweeper).toBe(true)
  })

  it("ignores another bowler's sweeper score (D-110)", async () => {
    const { deps, input, registrationId, state, sweeper } = setup()
    state.scores.push({ bowlerId: faker.string.uuid(), sessionId: sweeper.id })

    const result = await updateRegistration(deps, registrationId, input({ superSweeper: true }))

    expect(result.ok).toBe(true)
  })
})

describe('division and average (REG-15, REG-37, REG-38)', () => {
  it('moves the registration to another division of the tournament (REG-37)', async () => {
    const { deps, input, registrationId, stored, otherDivision } = setup()

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ divisionId: otherDivision.id }),
    )

    expect(result.ok).toBe(true)
    expect(stored()?.divisionId).toBe(otherDivision.id)
    expect(stored()?.average).toBe(185)
  })

  it('rejects a division of another tournament (REG-37)', async () => {
    const { deps, input, registrationId, state } = setup()
    const stranger = createDivision()
    state.divisions.push({ id: stranger.id, tournamentId: faker.string.uuid() })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ divisionId: stranger.id })),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'validation',
        code: 'Registration.DivisionNotInTournament',
        description: 'Division ID is not valid for the tournament.',
      }),
    ])
  })

  it('reports an unknown division as a failure that is not a validation error (REG-37)', async () => {
    const { deps, input, registrationId } = setup()

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ divisionId: faker.string.uuid() })),
    )

    expect(failures).toEqual([
      expect.objectContaining({ kind: 'other', code: 'Division.NotFound' }),
    ])
  })

  it('checks the new division against the average and the bowler (REG-37, REG-04)', async () => {
    const { deps, input, registrationId, otherDivision } = setup()
    otherDivision.minimumAverage = 200

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ divisionId: otherDivision.id })),
    )

    expect(failures.map((f) => f.kind)).toEqual(['validation'])
    expect(failures[0]?.description).toMatch(/average/i)
  })

  it('does not re-check the division when no division or average is sent (REG-37)', async () => {
    const { deps, input, registrationId, stored } = setup({ division: { minimumAverage: 200 } })

    const result = await updateRegistration(deps, registrationId, input({ superSweeper: true }))

    expect(result.ok).toBe(true)
    expect(stored()?.superSweeper).toBe(true)
  })

  it('checks the new division, not the old one (REG-37)', async () => {
    const { deps, input, registrationId, division, otherDivision } = setup({
      division: { maximumAverage: 150 },
    })

    const toOther = await updateRegistration(
      deps,
      registrationId,
      input({ divisionId: otherDivision.id }),
    )
    const backToLimited = await updateRegistration(
      deps,
      registrationId,
      input({ divisionId: division.id }),
    )

    expect(toOther.ok).toBe(true)
    expect(backToLimited.ok).toBe(false)
  })

  it('applies an average sent without a division (REG-38, D-116)', async () => {
    const { deps, input, registrationId, stored } = setup()

    const result = await updateRegistration(deps, registrationId, input({ average: 201 }))

    expect(result.ok).toBe(true)
    expect(stored()?.average).toBe(201)
  })

  it('checks an average sent alone against the current division (D-116)', async () => {
    const { deps, input, registrationId, stored } = setup({ division: { maximumAverage: 190 } })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ average: 201 })),
    )

    expect(failures.map((f) => f.kind)).toEqual(['validation'])
    expect(stored()?.average).toBe(185)
  })

  it('refuses a desk division change once the bowler has a score (REG-15, D-117)', async () => {
    const { deps, input, registrationId, otherDivision } = setup({ scoredOn: ['squad'] })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ divisionId: otherDivision.id })),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        code: 'Registration.DivisionLocked',
        description: 'Cannot change bowler division after scores have been recorded.',
      }),
    ])
  })

  it('lets a paid request change the division after scores, as legacy does (D-117)', async () => {
    const { deps, input, registrationId, otherDivision, stored } = setup({ scoredOn: ['squad'] })

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ divisionId: otherDivision.id, payment: paid }),
    )

    expect(result.ok).toBe(true)
    expect(stored()?.divisionId).toBe(otherDivision.id)
  })

  it('lets a desk request resend the same division after scores (D-117)', async () => {
    const { deps, input, registrationId, division } = setup({ scoredOn: ['squad'] })

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ divisionId: division.id }),
    )

    expect(result.ok).toBe(true)
  })

  it('does not count a score from another tournament (D-117)', async () => {
    const { deps, input, registrationId, otherDivision, state } = setup()
    const elsewhere = session('squad', faker.string.uuid())
    state.sessions.push(elsewhere)
    state.scores.push({ bowlerId: state.bowlers[0]?.id ?? '', sessionId: elsewhere.id })

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ divisionId: otherDivision.id }),
    )

    expect(result.ok).toBe(true)
  })
})

describe('payment (REG-39, D-118)', () => {
  it('saves the payment with the server time (REG-39, PAY-02, PAY-04)', async () => {
    const { deps, input, registrationId, state } = setup()

    const result = await updateRegistration(deps, registrationId, input({ payment: paid }))

    expect(result.ok).toBe(true)
    expect(state.payments).toEqual([{ registrationId, confirmationCode: 'Stripe_ch_1' }])
  })

  it('answers a code already on this registration as a retry and writes nothing (D-118)', async () => {
    const { deps, input, registrationId, state, stored, squad } = setup()
    state.payments.push({ registrationId, confirmationCode: 'Stripe_ch_1' })

    const result = await updateRegistration(
      deps,
      registrationId,
      input({ payment: paid, average: 250, squadIds: [] }),
    )

    expect(result).toEqual({ ok: true, mode: 'retry' })
    expect(state.payments).toHaveLength(1)
    expect(stored()?.average).toBe(185)
    expect(stored()?.sessionIds).toContain(squad.id)
  })

  it('refuses a code that belongs to another registration', async () => {
    const { deps, input, registrationId, state } = setup()
    state.payments.push({
      registrationId: faker.string.uuid(),
      confirmationCode: 'Stripe_ch_1',
    })

    const failures = await failuresOf(
      updateRegistration(deps, registrationId, input({ payment: paid })),
    )

    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'validation',
        code: 'Payment.AlreadyUsed',
        description: 'The payment confirmation belongs to another registration.',
      }),
    ])
    expect(state.payments).toHaveLength(1)
  })
})

describe('a failure writes nothing', () => {
  it('leaves the registration and payments as they were', async () => {
    const { deps, input, registrationId, state, stored, secondSquad } = setup({
      scoredOn: ['squad'],
    })
    const before = structuredClone(stored())

    await updateRegistration(
      deps,
      registrationId,
      input({ squadIds: [secondSquad.id], average: 150, payment: paid }),
    )

    expect(stored()).toEqual(before)
    expect(state.payments).toEqual([])
  })
})
