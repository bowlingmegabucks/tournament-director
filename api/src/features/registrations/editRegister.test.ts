import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createDivision, createSweeper, createTournament } from '../../test/factories.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import type { Division } from '../divisions/types.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { editRegistration, type EditResult } from './editRegister.ts'
import { parseEditRequest, type EditRequest } from './editRequest.ts'
import {
  createInMemoryRegistrationWriter,
  type RegistrationWriter,
  type StoredSession,
} from './writer.ts'

const now = new Date('2026-10-01T12:00:00Z')

const session = (
  kind: 'squad' | 'sweeper',
  tournamentId: string,
  complete = false,
): StoredSession => ({ id: faker.string.uuid(), tournamentId, kind, complete })

interface Options {
  division?: Partial<Division>
  otherDivision?: Partial<Division>
  superSweeper?: boolean
  completed?: boolean
  /** Sessions the registration holds, by index into squads, then sweepers. */
  held?: { squads?: number[]; sweepers?: number[] }
  completeIndexes?: { squads?: number[]; sweepers?: number[] }
  scoredIn?: ('squad0' | 'squad1' | 'sweeper0')[]
  /** A score this bowler has in a squad of another tournament. */
  scoredElsewhere?: boolean
  average?: number | null
  bowler?: Partial<ReturnType<typeof createCommonBowler>>
}

/** A tournament with two divisions, three squads, two sweepers, and one registered bowler. */
function setup(options: Options = {}) {
  const tournament = createTournament({ startDate: '2026-10-23' })
  const division = createDivision(options.division)
  const otherDivision = createDivision(options.otherDivision)
  const squads = [0, 1, 2].map((i) =>
    session('squad', tournament.id, options.completeIndexes?.squads?.includes(i)),
  )
  const sweepers = [0, 1].map((i) =>
    session('sweeper', tournament.id, options.completeIndexes?.sweepers?.includes(i)),
  )
  const bowler = createCommonBowler(options.bowler)
  const registrationId = faker.string.uuid()
  const sessionIds = [
    ...(options.held?.squads ?? [0]).map((i) => squads[i]?.id ?? ''),
    ...(options.held?.sweepers ?? [0]).map((i) => sweepers[i]?.id ?? ''),
  ]
  const scoreSessions = {
    squad0: squads[0],
    squad1: squads[1],
    sweeper0: sweepers[0],
  }
  const elsewhere = session('squad', 'another-tournament')
  const { writer, state } = createInMemoryRegistrationWriter({
    bowlers: [bowler],
    divisions: [
      { id: division.id, tournamentId: tournament.id },
      { id: otherDivision.id, tournamentId: tournament.id },
    ],
    registrations: [
      {
        tournamentId: tournament.id,
        registration: {
          id: registrationId,
          bowlerId: bowler.id,
          divisionId: division.id,
          average: options.average === undefined ? 180 : options.average,
          superSweeper: options.superSweeper ?? false,
          sessionIds,
        },
      },
    ],
    sessions: [...squads, ...sweepers, elsewhere],
    scores: [
      ...(options.scoredIn ?? []).map((key) => ({
        bowlerId: bowler.id,
        sessionId: scoreSessions[key]?.id ?? '',
      })),
      ...(options.scoredElsewhere ? [{ bowlerId: bowler.id, sessionId: elsewhere.id }] : []),
    ],
  })
  const deps = {
    tournaments: createInMemoryTournamentRepository(
      [tournament],
      {},
      {
        [tournament.id]: {
          games: 5,
          finalsRatio: 8,
          cashRatio: 5,
          superSweeperCashRatio: 8,
          completed: options.completed ?? false,
        },
      },
    ),
    divisions: createInMemoryDivisionRepository([
      { tournamentId: tournament.id, division },
      { tournamentId: tournament.id, division: otherDivision },
    ]),
    sweepers: createInMemorySweeperRepository(
      sweepers.map((s) => ({ tournamentId: tournament.id, sweeper: createSweeper({ id: s.id }) })),
    ),
    writer,
    now: () => now,
  }
  function request(overrides: Record<string, unknown> = {}): EditRequest {
    const parsed = parseEditRequest(overrides)
    if (!parsed.success) throw new Error(`bad test input: ${JSON.stringify(parsed.errors)}`)
    return parsed.data
  }
  const run = (overrides: Record<string, unknown> = {}, id = registrationId) =>
    editRegistration(deps, tournament.id, id, request(overrides))
  return {
    deps,
    state,
    tournament,
    division,
    otherDivision,
    squads,
    sweepers,
    bowler,
    registrationId,
    request,
    run,
    writer,
  }
}

async function messagesOf(result: Promise<EditResult>): Promise<string[]> {
  const outcome = await result
  if (outcome.ok || outcome.kind !== 'failures') {
    throw new Error(`expected failures, got ${JSON.stringify(outcome)}`)
  }
  return outcome.failures.map((failure) => failure.description)
}

async function codesOf(result: Promise<EditResult>): Promise<string[]> {
  const outcome = await result
  if (outcome.ok || outcome.kind !== 'failures') {
    throw new Error(`expected failures, got ${JSON.stringify(outcome)}`)
  }
  return outcome.failures.map((failure) => failure.code)
}

const heldIds = (state: ReturnType<typeof setup>['state'], registrationId: string) =>
  state.registrations.find((entry) => entry.registration.id === registrationId)?.registration
    .sessionIds ?? []

describe('adding a squad or sweeper (REG-21, D-200)', () => {
  it('adds a squad and records the $0 desk placeholder (REG-21, D-200)', async () => {
    const { run, state, squads, registrationId } = setup()

    const result = await run({ addSquadIds: [squads[1]?.id] })

    expect(result).toEqual({ ok: true, registrationId, added: 1, removed: 0 })
    expect(heldIds(state, registrationId)).toContain(squads[1]?.id)
    expect(state.payments).toHaveLength(1)
    expect(state.payments[0]?.confirmationCode).toMatch(/^Manual_[0-9a-f-]{36}$/)
  })

  it('refuses a squad that is complete or not in this tournament (REG-33, D-108)', async () => {
    const { run, state, squads, registrationId } = setup({ completeIndexes: { squads: [1] } })

    expect(await messagesOf(run({ addSquadIds: [squads[1]?.id] }))).toEqual([
      'Cannot add squad(s) that are already complete.',
    ])
    expect(await messagesOf(run({ addSquadIds: [faker.string.uuid()] }))).toEqual([
      'Invalid squad IDs',
    ])
    expect(heldIds(state, registrationId)).toHaveLength(2)
    expect(state.payments).toHaveLength(0)
  })

  it('refuses a sweeper id sent as a squad (REG-32)', async () => {
    const { run, sweepers } = setup()

    expect(await messagesOf(run({ addSquadIds: [sweepers[1]?.id] }))).toEqual(['Invalid squad IDs'])
  })
})

describe('removing a squad or sweeper (REG-20, D-203)', () => {
  it('removes a squad and a sweeper and records no payment (REG-20, D-200)', async () => {
    const { run, state, squads, sweepers, registrationId } = setup({
      held: { squads: [0, 1], sweepers: [0] },
    })

    const result = await run({
      removeSquadIds: [squads[1]?.id],
      removeSweeperIds: [sweepers[0]?.id],
    })

    expect(result).toEqual({ ok: true, registrationId, added: 0, removed: 2 })
    expect(heldIds(state, registrationId)).toEqual([squads[0]?.id])
    expect(state.payments).toHaveLength(0)
  })

  it('refuses a squad where the bowler has scores (REG-34)', async () => {
    const { run, state, squads, registrationId } = setup({
      held: { squads: [0, 1] },
      scoredIn: ['squad1'],
    })

    expect(await messagesOf(run({ removeSquadIds: [squads[1]?.id] }))).toEqual([
      'Bowler has already bowled in removed squads.',
    ])
    expect(heldIds(state, registrationId)).toContain(squads[1]?.id)
  })

  it('refuses a sweeper where the bowler has scores (REG-34)', async () => {
    const { run, sweepers } = setup({ scoredIn: ['sweeper0'] })

    expect(await messagesOf(run({ removeSweeperIds: [sweepers[0]?.id] }))).toEqual([
      'Bowler has already bowled in removed sweepers.',
    ])
  })

  it('refuses a complete squad or sweeper, scores or not (D-10)', async () => {
    const { run, squads, sweepers } = setup({
      held: { squads: [0, 1], sweepers: [0] },
      completeIndexes: { squads: [1], sweepers: [0] },
    })

    expect(await messagesOf(run({ removeSquadIds: [squads[1]?.id] }))).toEqual([
      'Cannot remove a squad that is already complete.',
    ])
    expect(await messagesOf(run({ removeSweeperIds: [sweepers[0]?.id] }))).toEqual([
      'Cannot remove a sweeper that is already complete.',
    ])
  })

  it('refuses to remove the last squad (REG-03, D-04, D-203)', async () => {
    const { run, squads } = setup()

    expect(await messagesOf(run({ removeSquadIds: [squads[0]?.id] }))).toEqual([
      'Bowler must enter at least one squad',
    ])
  })

  it('allows a swap of the only squad in one save (D-202)', async () => {
    const { run, state, squads, registrationId } = setup()

    const result = await run({ removeSquadIds: [squads[0]?.id], addSquadIds: [squads[2]?.id] })

    expect(result).toMatchObject({ ok: true, added: 1, removed: 1 })
    expect(heldIds(state, registrationId)).toEqual([expect.any(String), squads[2]?.id])
    expect(heldIds(state, registrationId)).not.toContain(squads[0]?.id)
    expect(state.payments).toHaveLength(1)
  })

  it('a failed add removes nothing (D-202)', async () => {
    const { run, state, squads, registrationId } = setup({ completeIndexes: { squads: [2] } })

    await run({ removeSquadIds: [squads[0]?.id], addSquadIds: [squads[2]?.id] })

    expect(heldIds(state, registrationId)).toContain(squads[0]?.id)
  })

  it('refuses a request that adds and removes the same squad', () => {
    const id = faker.string.uuid()

    const parsed = parseEditRequest({ addSquadIds: [id], removeSquadIds: [id] })

    expect(parsed).toMatchObject({
      success: false,
      errors: { form: 'A squad or sweeper cannot be added and removed in one change.' },
    })
  })
})

describe('super sweeper (REG-06, REG-17, REG-18, REG-35, D-110, D-203, D-204)', () => {
  it('turns it on when the bowler holds every sweeper (REG-06)', async () => {
    const { run, state, registrationId } = setup({ held: { squads: [0], sweepers: [0, 1] } })

    expect(await run({ superSweeper: true })).toMatchObject({ ok: true })
    expect(state.registrations[0]?.registration.superSweeper).toBe(true)
    expect(registrationId).toBeTruthy()
  })

  it('adds the missing sweeper and turns it on in one save (REG-17)', async () => {
    const { run, state, sweepers } = setup()

    const result = await run({ superSweeper: true, addSweeperIds: [sweepers[1]?.id] })

    expect(result).toMatchObject({ ok: true, added: 1 })
    expect(state.registrations[0]?.registration.superSweeper).toBe(true)
  })

  it('refuses it while a sweeper is missing (REG-35)', async () => {
    const { run } = setup()

    expect(await messagesOf(run({ superSweeper: true }))).toEqual([
      'Super Sweeper cannot be enrolled when not all sweepers are registered.',
    ])
  })

  it('refuses turning it on when a held sweeper is complete (REG-17)', async () => {
    const { run } = setup({
      held: { squads: [0], sweepers: [0, 1] },
      completeIndexes: { sweepers: [1] },
    })

    expect(await messagesOf(run({ superSweeper: true }))).toEqual([
      "Cannot add Super Sweeper when one of the bowler's sweepers is complete.",
    ])
  })

  it('turns it off, and refuses once this bowler has a sweeper score (REG-18, D-110)', async () => {
    const free = setup({ superSweeper: true, held: { squads: [0], sweepers: [0, 1] } })
    expect(await free.run({ superSweeper: false })).toMatchObject({ ok: true })
    expect(free.state.registrations[0]?.registration.superSweeper).toBe(false)

    const locked = setup({
      superSweeper: true,
      held: { squads: [0], sweepers: [0, 1] },
      scoredIn: ['sweeper0'],
    })
    expect(await messagesOf(locked.run({ superSweeper: false }))).toEqual([
      'Cannot change Super Sweeper when sweeper scores have been recorded.',
    ])
  })

  it('does not check it when it stays on and a squad is added (REG-35)', async () => {
    const { run, squads } = setup({ superSweeper: true, held: { squads: [0], sweepers: [0, 1] } })

    expect(await run({ addSquadIds: [squads[1]?.id] })).toMatchObject({ ok: true })
  })

  it('refuses removing a sweeper while super sweeper stays on (D-203)', async () => {
    const { run, sweepers } = setup({ superSweeper: true, held: { squads: [0], sweepers: [0, 1] } })

    expect(await messagesOf(run({ removeSweeperIds: [sweepers[1]?.id] }))).toEqual([
      'Remove the Super Sweeper first, then remove this sweeper.',
    ])
  })

  it('removes a sweeper and turns super sweeper off in one save (D-203)', async () => {
    const { run, state, sweepers, registrationId } = setup({
      superSweeper: true,
      held: { squads: [0], sweepers: [0, 1] },
    })

    const result = await run({ superSweeper: false, removeSweeperIds: [sweepers[1]?.id] })

    expect(result).toMatchObject({ ok: true, removed: 1 })
    expect(heldIds(state, registrationId)).not.toContain(sweepers[1]?.id)
  })
})

describe('division and average (REG-15, REG-16, REG-04, BWL-18, D-201, D-205)', () => {
  it('moves the division and saves gender, birth date, and USBC ID (REG-15, BWL-18)', async () => {
    const { run, state, otherDivision, bowler } = setup()

    const result = await run({
      divisionId: otherDivision.id,
      bowler: { gender: 'Male', dateOfBirth: '1970-01-02', usbcId: '1111-2222' },
    })

    expect(result).toMatchObject({ ok: true })
    expect(state.registrations[0]?.registration.divisionId).toBe(otherDivision.id)
    expect(state.bowlers.find((b) => b.id === bowler.id)).toMatchObject({
      gender: 'Male',
      dateOfBirth: '1970-01-02',
      usbcId: '1111-2222',
    })
  })

  it('refuses a division change after any score (REG-15, D-117, D-205)', async () => {
    const { run, state, division, otherDivision } = setup({ scoredIn: ['squad0'] })

    expect(await messagesOf(run({ divisionId: otherDivision.id }))).toEqual([
      'Cannot change bowler division after scores have been recorded.',
    ])
    expect(state.registrations[0]?.registration.divisionId).toBe(division.id)
  })

  it('refuses a division that does not exist (REG-37)', async () => {
    const { run } = setup()

    expect(await messagesOf(run({ divisionId: faker.string.uuid() }))).toEqual([
      'The specified division does not exist.',
    ])
  })

  it('runs eligibility on the new division (REG-04, D-205)', async () => {
    const { run, state, division, otherDivision } = setup({
      otherDivision: { minimumAverage: 190, gender: 'Female' },
      bowler: { gender: 'Male', dateOfBirth: null },
    })

    expect(await messagesOf(run({ divisionId: otherDivision.id }))).toEqual([
      'Minimum average requirement for division not met',
      'Invalid gender for selected division',
    ])
    expect(state.registrations[0]?.registration.divisionId).toBe(division.id)
  })

  it('needs a USBC ID for a handicap division (REG-05)', async () => {
    const { run, otherDivision } = setup({
      otherDivision: { handicapPercentage: 80, handicapBase: 200 },
      bowler: { usbcId: '' },
    })

    expect(await messagesOf(run({ divisionId: otherDivision.id }))).toEqual([
      'USBC Id is required for Handicap Divisions',
    ])
  })

  it('does not run eligibility when nothing it reads changed (D-205)', async () => {
    // The division was edited after the bowler registered (D-12): they no longer fit, yet they can add a squad.
    const { run, squads } = setup({ division: { minimumAverage: 250 }, average: 180 })

    expect(await run({ addSquadIds: [squads[1]?.id] })).toMatchObject({ ok: true })
  })

  it('saves a new average with no scores, and clears it with null (REG-16)', async () => {
    const { run, state } = setup()

    expect(await run({ average: 175 })).toMatchObject({ ok: true })
    expect(state.registrations[0]?.registration.average).toBe(175)

    expect(await run({ average: null })).toMatchObject({ ok: true })
    expect(state.registrations[0]?.registration.average).toBeNull()
  })

  it('re-checks the limits against a new average (REG-16, D-201)', async () => {
    const { run, state } = setup({ division: { minimumAverage: 150, maximumAverage: 200 } })

    expect(await messagesOf(run({ average: 140 }))).toEqual([
      'Minimum average requirement for division not met',
    ])
    expect(await messagesOf(run({ average: 210 }))).toEqual([
      'Maximum average requirement for division not met',
    ])
    expect(await messagesOf(run({ average: null }))).toEqual([
      'Average is required for selected division',
    ])
    expect(state.registrations[0]?.registration.average).toBe(180)
  })

  it('asks to confirm a new average once scores exist, then saves it (D-201)', async () => {
    const { run, state } = setup({ scoredIn: ['squad0'] })

    const asked = await run({ average: 175 })
    expect(asked).toEqual({
      ok: false,
      kind: 'warnings',
      warnings: [
        { field: 'average', message: 'This bowler has scores. Handicap and results will change.' },
      ],
    })
    expect(state.registrations[0]?.registration.average).toBe(180)

    expect(await run({ average: 175, confirmWarnings: true })).toMatchObject({ ok: true })
    expect(state.registrations[0]?.registration.average).toBe(175)
  })

  it('does not warn when the average is sent unchanged (D-201)', async () => {
    const { run } = setup({ scoredIn: ['squad0'] })

    expect(await run({ average: 180 })).toMatchObject({ ok: true })
  })

  it('refuses a bad request before it warns (D-201)', async () => {
    const { run } = setup({ scoredIn: ['squad0'], division: { maximumAverage: 200 } })

    expect(await messagesOf(run({ average: 250 }))).toEqual([
      'Maximum average requirement for division not met',
    ])
  })
})

describe('the bowler (BWL-16, BWL-01 to BWL-10, D-05, D-206)', () => {
  it('patches only the fields sent and leaves the rest (BWL-16)', async () => {
    const { run, state, bowler } = setup()

    await run({ bowler: { email: 'new@example.com' } })

    expect(state.bowlers.find((b) => b.id === bowler.id)).toEqual({
      ...bowler,
      email: 'new@example.com',
    })
  })

  it('clears a field sent empty (D-206)', async () => {
    const { run, state, bowler } = setup()

    const result = await run({
      bowler: { phoneNumber: '', email: '', suffix: '', dateOfBirth: '', gender: '' },
    })

    expect(result).toMatchObject({ ok: true })
    expect(state.bowlers.find((b) => b.id === bowler.id)).toMatchObject({
      phoneNumber: '',
      email: '',
      suffix: '',
      dateOfBirth: null,
      gender: null,
    })
  })

  it('formats phone and zip as add does (BWL-07a)', async () => {
    const { run, state, bowler } = setup()

    await run({ bowler: { phoneNumber: '+1 617-555-0100', zipCode: '02101-1234' } })

    expect(state.bowlers.find((b) => b.id === bowler.id)).toMatchObject({
      phoneNumber: '6175550100',
      zipCode: '021011234',
    })
  })

  it('does not clear a name (BWL-01, BWL-02)', async () => {
    const { run, state, bowler } = setup()

    expect(await messagesOf(run({ bowler: { firstName: ' ', lastName: '' } }))).toEqual([
      'First Name is Required',
      'Last Name is Required',
    ])
    expect(state.bowlers.find((b) => b.id === bowler.id)?.firstName).toBe(bowler.firstName)
  })

  it('does not clear the USBC ID of a handicap division (REG-05, D-206)', async () => {
    const { run } = setup({ division: { handicapPercentage: 80, handicapBase: 200 } })

    expect(await messagesOf(run({ bowler: { usbcId: '' } }))).toEqual([
      'USBC Id is required for Handicap Divisions',
    ])
  })

  it('runs the bowler rules on the stored values plus the edits (BWL-04 to BWL-10)', async () => {
    const { run } = setup()

    expect(
      await messagesOf(
        run({ bowler: { email: 'nope', phoneNumber: '12', usbcId: 'abc', state: 'N' } }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'Invalid Email',
        'Invalid Phone Number',
        'Invalid USBC Id',
        'State must be Postal Abbreviation',
      ]),
    )
  })

  it('does not run the bowler rules when no bowler field was sent (BWL-16)', async () => {
    const { run, squads } = setup({ bowler: { email: 'broken legacy value' } })

    expect(await run({ addSquadIds: [squads[1]?.id] })).toMatchObject({ ok: true })
  })

  it('refuses a USBC ID that another bowler holds (D-161)', async () => {
    const { run, deps } = setup()
    await deps.writer.save({
      bowler: {
        id: faker.string.uuid(),
        isNew: true,
        data: {
          ...createCommonBowler(),
          usbcId: '9999-8888',
        },
      },
      registration: {
        id: faker.string.uuid(),
        isNew: true,
        divisionId: faker.string.uuid(),
        average: null,
        superSweeper: false,
      },
      addSessionIds: [],
      payment: null,
    })

    expect(await messagesOf(run({ bowler: { usbcId: '9999-8888' } }))).toEqual([
      'Another bowler already has this USBC ID.',
    ])
  })
})

describe('a record that changed since the desk read it (D-199)', () => {
  it('answers changed for a squad to add that is already held, with the current record', async () => {
    const { run, squads, state, registrationId } = setup({ held: { squads: [0, 1] } })

    const result = await run({ addSquadIds: [squads[1]?.id] })

    expect(result).toMatchObject({
      ok: false,
      kind: 'changed',
      existing: { registrationId, squadIds: [squads[0]?.id, squads[1]?.id] },
    })
    expect(state.payments).toHaveLength(0)
  })

  it('answers changed for a squad to remove that is already gone', async () => {
    const { run, squads } = setup()

    const result = await run({ removeSquadIds: [squads[2]?.id] })

    expect(result).toMatchObject({ ok: false, kind: 'changed' })
  })

  it('answers changed when the guard fails inside the save, and writes nothing', async () => {
    const { deps, tournament, request, squads, state, registrationId } = setup({
      held: { squads: [0, 1] },
    })
    // The desk read the record before the site added squad 1: its read does not hold it.
    const staleWriter: RegistrationWriter = {
      ...deps.writer,
      getDetail: async (id) => {
        const detail = await deps.writer.getDetail(id)
        return (
          detail && {
            ...detail,
            sessionIds: detail.sessionIds.filter((sessionId) => sessionId !== squads[1]?.id),
          }
        )
      },
    }

    const result = await editRegistration(
      { ...deps, writer: staleWriter },
      tournament.id,
      registrationId,
      request({ addSquadIds: [squads[1]?.id], bowler: { email: 'x@example.com' } }),
    )

    expect(result).toMatchObject({ ok: false, kind: 'changed' })
    expect(state.bowlers[0]?.email).not.toBe('x@example.com')
    expect(state.payments).toHaveLength(0)
  })
})

describe('where the registration lives (REG-30, D-130)', () => {
  it('answers not found for an unknown registration or tournament (REG-30)', async () => {
    const { run, deps, request } = setup()

    expect(await run({}, faker.string.uuid())).toEqual({ ok: false, kind: 'registrationNotFound' })
    expect(
      await editRegistration(deps, faker.string.uuid(), faker.string.uuid(), request()),
    ).toEqual({
      ok: false,
      kind: 'tournamentNotFound',
    })
  })

  it('answers not found for a registration of another tournament (REG-30)', async () => {
    const { deps, registrationId, request } = setup()
    const elsewhere = createTournament()
    const both = { ...deps, tournaments: createInMemoryTournamentRepository([elsewhere]) }

    expect(await editRegistration(both, elsewhere.id, registrationId, request())).toEqual({
      ok: false,
      kind: 'registrationNotFound',
    })
  })

  it('refuses every edit on a complete tournament (D-130)', async () => {
    const { run, state, squads } = setup({ completed: true })

    expect(await run({ addSquadIds: [squads[1]?.id] })).toEqual({ ok: false, kind: 'complete' })
    expect(state.payments).toHaveLength(0)
  })
})

describe('failure codes, which the routes turn into form fields (EDR-04)', () => {
  it('names a removal with scores by kind (REG-34)', async () => {
    const squad = setup({ held: { squads: [0, 1] }, scoredIn: ['squad1'] })
    expect(await codesOf(squad.run({ removeSquadIds: [squad.squads[1]?.id] }))).toEqual([
      'Registration.RemovedSquadHasScores',
    ])

    const sweeper = setup({ scoredIn: ['sweeper0'] })
    expect(await codesOf(sweeper.run({ removeSweeperIds: [sweeper.sweepers[0]?.id] }))).toEqual([
      'Registration.RemovedSweeperHasScores',
    ])
  })

  it('names a complete removal by kind (D-10)', async () => {
    const squad = setup({ held: { squads: [0, 1] }, completeIndexes: { squads: [1] } })
    expect(await codesOf(squad.run({ removeSquadIds: [squad.squads[1]?.id] }))).toEqual([
      'Registration.RemovedSquadComplete',
    ])

    const sweeper = setup({ completeIndexes: { sweepers: [0] } })
    expect(await codesOf(sweeper.run({ removeSweeperIds: [sweeper.sweepers[0]?.id] }))).toEqual([
      'Registration.RemovedSweeperComplete',
    ])
  })

  it('names the super sweeper and division refusals', async () => {
    const locked = setup({
      superSweeper: true,
      held: { squads: [0], sweepers: [0, 1] },
      scoredIn: ['sweeper0'],
    })
    expect(await codesOf(locked.run({ superSweeper: false }))).toEqual([
      'Registration.SuperSweeperLocked',
    ])

    const complete = setup({
      held: { squads: [0], sweepers: [0, 1] },
      completeIndexes: { sweepers: [1] },
    })
    expect(await codesOf(complete.run({ superSweeper: true }))).toEqual([
      'Registration.SuperSweeperSweeperComplete',
    ])

    const first = setup({ superSweeper: true, held: { squads: [0], sweepers: [0, 1] } })
    expect(await codesOf(first.run({ removeSweeperIds: [first.sweepers[1]?.id] }))).toEqual([
      'Registration.SuperSweeperRemoveFirst',
    ])

    const missing = setup()
    expect(await codesOf(missing.run({ superSweeper: true }))).toEqual([
      'Registration.SuperSweeperNeedsAllSweepers',
    ])

    const division = setup({ scoredIn: ['squad0'] })
    expect(await codesOf(division.run({ divisionId: division.otherDivision.id }))).toEqual([
      'Registration.DivisionLocked',
    ])
  })

  it('names a USBC ID another bowler holds (D-161)', async () => {
    const { run, deps } = setup()
    await deps.writer.save({
      bowler: {
        id: faker.string.uuid(),
        isNew: true,
        data: { ...createCommonBowler(), usbcId: '9999-8888' },
      },
      registration: {
        id: faker.string.uuid(),
        isNew: true,
        divisionId: faker.string.uuid(),
        average: null,
        superSweeper: false,
      },
      addSessionIds: [],
      payment: null,
    })

    expect(await codesOf(run({ bowler: { usbcId: '9999-8888' } }))).toEqual(['Bowler.UsbcIdInUse'])
  })

  it('refuses a squad id sent as a sweeper removal, and the reverse (REG-32)', async () => {
    const { run, squads, sweepers } = setup()

    expect(await codesOf(run({ removeSweeperIds: [squads[0]?.id] }))).toEqual([
      'Registration.InvalidSweeperIds',
    ])
    expect(await messagesOf(run({ removeSweeperIds: [squads[0]?.id] }))).toEqual([
      'Invalid sweeper IDs',
    ])
    expect(await codesOf(run({ removeSquadIds: [sweepers[0]?.id] }))).toEqual([
      'Registration.InvalidSquadIds',
    ])
  })
})

describe('what is checked, and when (D-199, D-205, D-110)', () => {
  it('answers changed before it checks anything else (D-199)', async () => {
    const { run, squads } = setup({ held: { squads: [0, 1] } })

    const added = await run({ addSquadIds: [squads[1]?.id], bowler: { email: 'nope' } })
    const removed = await run({ removeSquadIds: [squads[2]?.id], bowler: { email: 'nope' } })

    expect(added).toMatchObject({ ok: false, kind: 'changed' })
    expect(removed).toMatchObject({ ok: false, kind: 'changed' })
  })

  it('answers changed for a held add even when a removal is fine, and for a gone removal with a fine add', async () => {
    const { run, squads } = setup({ held: { squads: [0, 1] } })

    expect(
      await run({ addSquadIds: [squads[1]?.id], removeSquadIds: [squads[0]?.id] }),
    ).toMatchObject({ kind: 'changed' })
    expect(
      await run({ addSquadIds: [squads[2]?.id], removeSweeperIds: [faker.string.uuid()] }),
    ).toMatchObject({ kind: 'changed' })
  })

  it('does not check super sweeper when it stays on and a squad is added, even if a sweeper was added to the tournament later (REG-35)', async () => {
    const { run, squads } = setup({ superSweeper: true, held: { squads: [0], sweepers: [0] } })

    expect(await run({ addSquadIds: [squads[1]?.id] })).toMatchObject({ ok: true })
  })

  it('lets super sweeper go off while a held sweeper is complete (REG-17)', async () => {
    const { run, state } = setup({
      superSweeper: true,
      held: { squads: [0], sweepers: [0, 1] },
      completeIndexes: { sweepers: [1] },
    })

    expect(await run({ superSweeper: false })).toMatchObject({ ok: true })
    expect(state.registrations[0]?.registration.superSweeper).toBe(false)
  })

  it('lets super sweeper change when the bowler has scores in a squad only (D-110)', async () => {
    const { run } = setup({ held: { squads: [0], sweepers: [0, 1] }, scoredIn: ['squad0'] })

    expect(await run({ superSweeper: true })).toMatchObject({ ok: true })
  })

  it('does not count a score from another tournament as a lock (REG-15)', async () => {
    const { run, otherDivision } = setup({ scoredElsewhere: true })

    expect(await run({ divisionId: otherDivision.id })).toMatchObject({ ok: true })
  })

  it('does not run eligibility for a bowler field sent unchanged (D-205)', async () => {
    const { run } = setup({ division: { minimumAverage: 250 }, bowler: { gender: 'Female' } })

    expect(await run({ bowler: { gender: 'Female' } })).toMatchObject({ ok: true })
    expect(await messagesOf(run({ bowler: { gender: 'Male' } }))).toEqual([
      'Minimum average requirement for division not met',
    ])
  })

  it('refuses a birth date of today or later (BWL-08)', async () => {
    const { run } = setup()

    expect(await messagesOf(run({ bowler: { dateOfBirth: '2026-10-01' } }))).toEqual([
      'Date of Birth must be in the past',
    ])
    expect(await run({ bowler: { dateOfBirth: '2026-09-30' } })).toMatchObject({ ok: true })
  })

  it('accepts the USBC ID the bowler already has, and clears it when the division needs none (D-161, D-206)', async () => {
    const { run, deps, state, bowler } = setup()
    await deps.writer.save({
      bowler: {
        id: faker.string.uuid(),
        isNew: true,
        data: { ...createCommonBowler(), usbcId: '' },
      },
      registration: {
        id: faker.string.uuid(),
        isNew: true,
        divisionId: faker.string.uuid(),
        average: null,
        superSweeper: false,
      },
      addSessionIds: [],
      payment: null,
    })

    expect(await run({ bowler: { usbcId: bowler.usbcId } })).toMatchObject({ ok: true })
    expect(await run({ bowler: { usbcId: '' } })).toMatchObject({ ok: true })
    expect(state.bowlers.find((b) => b.id === bowler.id)?.usbcId).toBe('')
  })

  it('passes on an error that is not a stale save (D-199)', async () => {
    const { deps, tournament, request, squads, registrationId } = setup()
    const broken: RegistrationWriter = {
      ...deps.writer,
      save: () => Promise.reject(new Error('disk full')),
    }

    await expect(
      editRegistration(
        { ...deps, writer: broken },
        tournament.id,
        registrationId,
        request({ addSquadIds: [squads[1]?.id] }),
      ),
    ).rejects.toThrow('disk full')
  })
})
