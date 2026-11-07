import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createDivision, createSweeper, createTournament } from '../../test/factories.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import type { Division } from '../divisions/types.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { deskRegister, toFieldErrors } from './deskRegister.ts'
import { parseDeskRequest, toDeskBowlerPatch, type DeskRequest } from './deskRequest.ts'
import { validation } from './problem.ts'
import {
  createInMemoryRegistrationWriter,
  type InMemoryWriterSeed,
  type StoredSession,
} from './writer.ts'

const now = new Date('2026-10-01T12:00:00Z')

interface Options {
  division?: Partial<Division>
  seed?: InMemoryWriterSeed
  completed?: boolean
}

function session(kind: 'squad' | 'sweeper', tournamentId: string, complete = false): StoredSession {
  return { id: faker.string.uuid(), tournamentId, kind, complete }
}

/** A tournament with an open division, two open squads, and one open sweeper. */
function setup({ division: divisionOverrides, seed, completed = false }: Options = {}) {
  const tournament = createTournament({ startDate: '2026-10-23' })
  const division = createDivision(divisionOverrides)
  const squads = [session('squad', tournament.id), session('squad', tournament.id)]
  const sweepers = [session('sweeper', tournament.id)]
  const { writer, state } = createInMemoryRegistrationWriter({
    divisions: [{ id: division.id, tournamentId: tournament.id }],
    ...seed,
    sessions: [...squads, ...sweepers, ...(seed?.sessions ?? [])],
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
          completed,
        },
      },
    ),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
    sweepers: createInMemorySweeperRepository(
      sweepers.map((s) => ({ tournamentId: tournament.id, sweeper: createSweeper({ id: s.id }) })),
    ),
    writer,
    now: () => now,
  }
  function request(overrides: Record<string, unknown> = {}): DeskRequest {
    const parsed = parseDeskRequest({
      divisionId: division.id,
      average: 185,
      squadIds: [squads[0]?.id],
      bowler: { firstName: 'Ann', lastName: 'Lee' },
      ...overrides,
    })
    if (!parsed.success) throw new Error(`bad test input: ${JSON.stringify(parsed.errors)}`)
    return parsed.data
  }
  return { deps, state, tournament, division, squads, sweepers, request }
}

async function failuresOf(result: ReturnType<typeof deskRegister>) {
  const outcome = await result
  if (outcome.ok || outcome.kind !== 'failures') throw new Error('expected failures')
  return outcome.failures
}

describe('a new bowler at the desk (REG-02, D-162)', () => {
  it('saves a bowler with only a first and last name, and no gender (D-162)', async () => {
    const { deps, state, tournament, request } = setup()

    const result = await deskRegister(deps, tournament.id, request())

    expect(result).toMatchObject({ ok: true, mode: 'created' })
    expect(state.bowlers).toHaveLength(1)
    expect(state.bowlers[0]).toMatchObject({
      firstName: 'Ann',
      lastName: 'Lee',
      email: '',
      street: '',
      usbcId: '',
      gender: null,
      dateOfBirth: null,
    })
    expect(state.registrations).toHaveLength(1)
  })

  it('formats phone and zip as the registration site does (BWL-07a)', async () => {
    const { deps, state, tournament, request } = setup()

    await deskRegister(
      deps,
      tournament.id,
      request({
        bowler: {
          firstName: 'Ann',
          lastName: 'Lee',
          street: '1 Main St',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101-1234',
          phoneNumber: '+1 617-555-0100',
          gender: 'Female',
          dateOfBirth: '1980-02-03',
        },
      }),
    )

    expect(state.bowlers[0]).toMatchObject({
      zipCode: '021011234',
      phoneNumber: '6175550100',
      gender: 'Female',
      dateOfBirth: '1980-02-03',
    })
  })

  it('refuses a missing name with the legacy messages (BWL-01, BWL-02)', async () => {
    const { deps, state, tournament, request } = setup()

    const failures = await failuresOf(
      deskRegister(deps, tournament.id, request({ bowler: { firstName: ' ', lastName: '' } })),
    )

    expect(failures.map((f) => f.description)).toEqual([
      'First Name is Required',
      'Last Name is Required',
    ])
    expect(state.bowlers).toHaveLength(0)
  })

  it('runs the address rules only when a street is given (BWL-04, BWL-05)', async () => {
    const { deps, tournament, request } = setup()

    const failures = await failuresOf(
      deskRegister(
        deps,
        tournament.id,
        request({ bowler: { firstName: 'Ann', lastName: 'Lee', street: '1 Main St' } }),
      ),
    )

    expect(failures.map((f) => f.code)).toEqual([
      'Bowler.CityRequired',
      'Bowler.StateInvalid',
      'Bowler.StateRequired',
      'Bowler.ZipCodeInvalid',
    ])
  })

  it('refuses a bad email, phone, USBC ID, and future birth date (BWL-06 to BWL-10)', async () => {
    const { deps, tournament, request } = setup()

    const failures = await failuresOf(
      deskRegister(
        deps,
        tournament.id,
        request({
          bowler: {
            firstName: 'Ann',
            lastName: 'Lee',
            email: 'nope',
            phoneNumber: '12',
            usbcId: 'abc',
            dateOfBirth: '2999-01-01',
          },
        }),
      ),
    )

    expect(failures.map((f) => f.code).sort()).toEqual([
      'Bowler.DateOfBirthInvalid',
      'Bowler.EmailInvalid',
      'Bowler.PhoneInvalid',
      'Bowler.UsbcIdInvalid',
    ])
  })

  it('needs a USBC ID only for a handicap division (REG-05)', async () => {
    const { deps, tournament, request } = setup({ division: { handicapPercentage: 90 } })

    const failures = await failuresOf(deskRegister(deps, tournament.id, request()))

    expect(failures).toMatchObject([
      {
        code: 'Registration.UsbcIdRequired',
        description: 'USBC Id is required for Handicap Divisions',
      },
    ])
  })

  it('accepts a handicap division when the bowler has a USBC ID (REG-05)', async () => {
    const { deps, tournament, request } = setup({ division: { handicapPercentage: 90 } })

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowler: { firstName: 'Ann', lastName: 'Lee', usbcId: '1234-56789' } }),
    )

    expect(result.ok).toBe(true)
  })

  it('checks the average and age against the division (REG-04)', async () => {
    const { deps, tournament, request } = setup({
      division: { minimumAverage: 190, minimumAge: 50 },
    })

    const failures = await failuresOf(deskRegister(deps, tournament.id, request()))

    expect(failures.map((f) => f.code).sort()).toEqual([
      'Registration.AverageTooLow',
      'Registration.BowlerTooYoung',
      'Registration.DateOfBirthRequired',
    ])
  })

  it('needs at least one squad (REG-03, D-04)', async () => {
    const { deps, tournament, request } = setup()

    const failures = await failuresOf(deskRegister(deps, tournament.id, request({ squadIds: [] })))

    expect(failures).toMatchObject([
      { code: 'Registration.SquadsRequired', description: 'Bowler must enter at least one squad' },
    ])
  })

  it('needs every sweeper for the super sweeper (REG-06)', async () => {
    const { deps, tournament, request } = setup()

    const failures = await failuresOf(
      deskRegister(deps, tournament.id, request({ superSweeper: true, sweeperIds: [] })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Registration.SuperSweeperNeedsAllSweepers'])
  })

  it('accepts the super sweeper with every sweeper (REG-06)', async () => {
    const { deps, state, tournament, request, sweepers } = setup()

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ superSweeper: true, sweeperIds: [sweepers[0]?.id] }),
    )

    expect(result.ok).toBe(true)
    expect(state.registrations[0]?.registration.superSweeper).toBe(true)
  })

  it('refuses a squad of another tournament (REG-32)', async () => {
    const foreign = session('squad', faker.string.uuid())
    const { deps, tournament, request } = setup({ seed: { sessions: [foreign] } })

    const failures = await failuresOf(
      deskRegister(deps, tournament.id, request({ squadIds: [foreign.id] })),
    )

    expect(failures.map((f) => f.code)).toContain('Registration.InvalidSquadIds')
  })

  it('refuses a complete squad of this tournament (REG-33)', async () => {
    const closed = session('squad', 'unset', true)
    const first = setup()
    const withClosed = { ...closed, tournamentId: first.tournament.id }
    const { deps, tournament, request } = setup({ seed: { sessions: [withClosed] } })
    // The helper makes its own tournament id, so place the complete squad in that one.
    const placed = { ...withClosed, tournamentId: tournament.id }
    deps.writer.findSessions = (ids) => Promise.resolve(ids.includes(placed.id) ? [placed] : [])

    const failures = await failuresOf(
      deskRegister(deps, tournament.id, request({ squadIds: [placed.id] })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Registration.SquadComplete'])
  })
})

describe('the placeholder payment (REG-08, PAY-01a, D-163)', () => {
  it('saves a Manual_ payment of 43 characters, and a fresh one each time', async () => {
    const first = setup()
    const second = setup()

    await deskRegister(first.deps, first.tournament.id, first.request())
    await deskRegister(second.deps, second.tournament.id, second.request())

    const [one] = first.state.payments
    const [two] = second.state.payments
    expect(one?.confirmationCode).toMatch(/^Manual_[0-9a-f-]{36}$/)
    expect(one?.confirmationCode).toHaveLength(43)
    expect(one?.confirmationCode).not.toBe(two?.confirmationCode)
  })
})

describe('an existing bowler (BWL-15, REG-07, D-05, D-158)', () => {
  it('adds a registration for a stored bowler and patches only the fields sent', async () => {
    const bowler = createCommonBowler({ usbcId: '1111-22222' })
    const { deps, state, tournament, request } = setup({ seed: { bowlers: [bowler] } })

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowlerId: bowler.id, bowler: { street: '88 Pine Road', city: '' } }),
    )

    expect(result).toMatchObject({ ok: true, mode: 'created' })
    expect(state.bowlers).toHaveLength(1)
    expect(state.bowlers[0]).toEqual({ ...bowler, street: '88 Pine Road' })
  })

  it('answers an unknown bowler id as not found', async () => {
    const { deps, tournament, request } = setup()

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowlerId: faker.string.uuid() }),
    )

    expect(result).toEqual({ ok: false, kind: 'bowlerNotFound' })
  })

  it('runs the bowler rules on the stored bowler with the edits on top (REG-02)', async () => {
    const bowler = createCommonBowler()
    const { deps, tournament, request } = setup({ seed: { bowlers: [bowler] } })

    const failures = await failuresOf(
      deskRegister(
        deps,
        tournament.id,
        request({ bowlerId: bowler.id, bowler: { email: 'not-an-email' } }),
      ),
    )

    expect(failures.map((f) => f.code)).toEqual(['Bowler.EmailInvalid'])
  })
})

describe('a state too long for its column', () => {
  it('is a field error on the state box, with or without a street', () => {
    const parsed = parseDeskRequest({
      divisionId: faker.string.uuid(),
      bowler: { firstName: 'Ann', lastName: 'Lee', city: 'Akron', state: 'Ohio' },
    })

    expect(parsed).toMatchObject({
      success: false,
      errors: { 'bowler.state': 'State must be Postal Abbreviation' },
    })
  })

  it('accepts two letters, padded with spaces or not', () => {
    const parsed = parseDeskRequest({
      divisionId: faker.string.uuid(),
      bowler: { firstName: 'Ann', lastName: 'Lee', state: ' OH ' },
    })

    expect(parsed.success).toBe(true)
  })
})

describe('a new bowler whose USBC ID is on file (BWL-15, D-161)', () => {
  it('offers the stored bowler and saves nothing', async () => {
    const bowler = createCommonBowler({ usbcId: '1234-56789', suffix: 'Jr' })
    const { deps, state, tournament, request } = setup({ seed: { bowlers: [bowler] } })

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowler: { firstName: 'Joe', lastName: 'Fontaine', usbcId: '1234-56789' } }),
    )

    expect(result).toEqual({
      ok: false,
      kind: 'usbcIdOnFile',
      bowler: { id: bowler.id, name: 'Joseph Fontaine, Jr' },
    })
    expect(state.bowlers).toHaveLength(1)
    expect(state.registrations).toHaveLength(0)
  })

  it('does not match on a name alone (D-161)', async () => {
    const bowler = createCommonBowler({ firstName: 'Robert', lastName: 'Smith', usbcId: '' })
    const { deps, state, tournament, request } = setup({ seed: { bowlers: [bowler] } })

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowler: { firstName: 'Bob', lastName: 'Smith' } }),
    )

    expect(result).toMatchObject({ ok: true, mode: 'created' })
    expect(state.bowlers).toHaveLength(2)
  })

  it('does not look up an empty USBC ID, so two bowlers without one are fine (D-02)', async () => {
    const bowler = createCommonBowler({ usbcId: '' })
    const { deps, tournament, request } = setup({ seed: { bowlers: [bowler] } })

    const result = await deskRegister(deps, tournament.id, request())

    expect(result.ok).toBe(true)
  })
})

describe('a stored bowler given a USBC ID another bowler holds (BWL-15, D-161)', () => {
  it('refuses the ID under its box, and saves nothing', async () => {
    const holder = createCommonBowler({ usbcId: '1234-56789' })
    const picked = createCommonBowler({ usbcId: '1111-22222' })
    const { deps, state, tournament, request } = setup({ seed: { bowlers: [holder, picked] } })

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowlerId: picked.id, bowler: { usbcId: '1234-56789' } }),
    )

    expect(result).toEqual({
      ok: false,
      kind: 'failures',
      failures: [validation('Bowler.UsbcIdInUse', 'Another bowler already has this USBC ID.')],
    })
    expect(state.bowlers.find((b) => b.id === picked.id)?.usbcId).toBe('1111-22222')
    expect(state.registrations).toHaveLength(0)
  })

  it('lets the bowler keep their own ID, and take an ID nobody holds', async () => {
    const picked = createCommonBowler({ usbcId: '1111-22222' })
    const { deps, tournament, request } = setup({ seed: { bowlers: [picked] } })

    const same = await deskRegister(
      deps,
      tournament.id,
      request({ bowlerId: picked.id, bowler: { usbcId: '1111-22222' } }),
    )
    expect(same.ok).toBe(true)

    const other = setup({ seed: { bowlers: [picked] } })
    const changed = await deskRegister(
      other.deps,
      other.tournament.id,
      other.request({ bowlerId: picked.id, bowler: { usbcId: '9999-88888' } }),
    )
    expect(changed.ok).toBe(true)
  })
})

describe('a bowler already registered here (REG-01, REG-10 to REG-14, D-159, D-160, D-165)', () => {
  function registered(extra: Options = {}) {
    const bowler = createCommonBowler({ usbcId: '1111-22222' })
    const context = setup({ ...extra, seed: { bowlers: [bowler], ...extra.seed } })
    const stored = {
      id: faker.string.uuid(),
      bowlerId: bowler.id,
      divisionId: context.division.id,
      average: 170,
      superSweeper: false,
      sessionIds: [context.squads[0]?.id ?? ''],
    }
    context.state.registrations.push({ tournamentId: context.tournament.id, registration: stored })
    return { ...context, bowler, stored }
  }

  it('answers a conflict with the existing registration, and saves nothing (REG-01, D-159)', async () => {
    const { deps, state, tournament, request, bowler, stored, division, sweepers } = registered()
    state.registrations[0]?.registration.sessionIds.push(sweepers[0]?.id ?? '')

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowlerId: bowler.id, squadIds: [stored.sessionIds[0]] }),
    )

    expect(result).toEqual({
      ok: false,
      kind: 'alreadyRegistered',
      existing: {
        registrationId: stored.id,
        divisionId: division.id,
        divisionName: division.name,
        squadIds: stored.sessionIds.slice(0, 1),
        sweeperIds: [sweepers[0]?.id],
      },
    })
    expect(state.payments).toHaveLength(0)
  })

  it('appends the new squads, patches the bowler, and adds a payment (REG-10 to REG-14)', async () => {
    const { deps, state, tournament, request, bowler, stored, squads } = registered()

    const result = await deskRegister(
      deps,
      tournament.id,
      request({
        bowlerId: bowler.id,
        appendToExisting: true,
        average: null,
        squadIds: [squads[1]?.id],
        bowler: { city: 'Boston' },
      }),
    )

    expect(result).toEqual({ ok: true, registrationId: stored.id, mode: 'appended' })
    expect(state.registrations).toHaveLength(1)
    expect(state.registrations[0]?.registration).toMatchObject({
      average: 170,
      sessionIds: [squads[0]?.id, squads[1]?.id],
    })
    expect(state.bowlers[0]).toMatchObject({ city: 'Boston', street: bowler.street })
    expect(state.payments).toHaveLength(1)
  })

  it('refuses a squad already on the registration (REG-11)', async () => {
    const { deps, tournament, request, bowler, squads } = registered()

    const failures = await failuresOf(
      deskRegister(
        deps,
        tournament.id,
        request({ bowlerId: bowler.id, appendToExisting: true, squadIds: [squads[0]?.id] }),
      ),
    )

    expect(failures.map((f) => f.code)).toEqual(['Squad.Conflict'])
  })

  it('needs no new squad when the bowler already has one (REG-03)', async () => {
    const { deps, tournament, request, bowler, sweepers } = registered()

    const result = await deskRegister(
      deps,
      tournament.id,
      request({
        bowlerId: bowler.id,
        appendToExisting: true,
        squadIds: [],
        sweeperIds: [sweepers[0]?.id],
      }),
    )

    expect(result).toMatchObject({ ok: true, mode: 'appended' })
  })

  it('moves the registration to another division when no score exists (REG-12, D-160)', async () => {
    const other = createDivision()
    const { deps, state, tournament, request, bowler } = registered()
    state.divisions.push({ id: other.id, tournamentId: tournament.id })
    const moved = {
      ...deps,
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: other },
        { tournamentId: tournament.id, division: createDivision({ id: state.divisions[0]?.id }) },
      ]),
    }

    const result = await deskRegister(
      moved,
      tournament.id,
      request({
        divisionId: other.id,
        bowlerId: bowler.id,
        appendToExisting: true,
        squadIds: [],
        sweeperIds: [],
      }),
    )

    expect(result).toMatchObject({ ok: true, mode: 'appended' })
    expect(state.registrations[0]?.registration.divisionId).toBe(other.id)
  })

  it('refuses a division move once the bowler has a score (REG-15, D-160)', async () => {
    const other = createDivision()
    const { deps, state, tournament, request, bowler, squads } = registered()
    state.divisions.push({ id: other.id, tournamentId: tournament.id })
    state.scores.push({ bowlerId: bowler.id, sessionId: squads[0]?.id ?? '' })
    const moved = {
      ...deps,
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: other },
      ]),
    }

    const failures = await failuresOf(
      deskRegister(
        moved,
        tournament.id,
        request({
          divisionId: other.id,
          bowlerId: bowler.id,
          appendToExisting: true,
          squadIds: [squads[1]?.id],
        }),
      ),
    )

    expect(failures).toMatchObject([
      {
        code: 'Registration.DivisionLocked',
        description: 'Cannot change bowler division after scores have been recorded.',
      },
    ])
  })

  it('lets a score from another tournament pass: only this tournament locks a move (D-160)', async () => {
    const other = createDivision()
    const elsewhere = session('squad', faker.string.uuid())
    const { deps, state, tournament, request, bowler, squads } = registered({
      seed: { sessions: [elsewhere] },
    })
    state.divisions.push({ id: other.id, tournamentId: tournament.id })
    state.scores.push({ bowlerId: bowler.id, sessionId: elsewhere.id })
    const moved = {
      ...deps,
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: other },
      ]),
    }

    const result = await deskRegister(
      moved,
      tournament.id,
      request({
        divisionId: other.id,
        bowlerId: bowler.id,
        appendToExisting: true,
        squadIds: [squads[1]?.id],
      }),
    )

    expect(result).toMatchObject({ ok: true, mode: 'appended' })
  })

  it('lets a bowler with scores add a squad in the same division (D-160)', async () => {
    const { deps, state, tournament, request, bowler, squads } = registered()
    state.scores.push({ bowlerId: bowler.id, sessionId: squads[0]?.id ?? '' })

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowlerId: bowler.id, appendToExisting: true, squadIds: [squads[1]?.id] }),
    )

    expect(result).toMatchObject({ ok: true, mode: 'appended' })
  })

  it('treats a stale append flag on a new registration as a create (D-165)', async () => {
    const bowler = createCommonBowler({ usbcId: '' })
    const { deps, tournament, request } = setup({ seed: { bowlers: [bowler] } })

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowlerId: bowler.id, appendToExisting: true }),
    )

    expect(result).toMatchObject({ ok: true, mode: 'created' })
  })
})

describe('what the desk cannot change', () => {
  it('answers an unknown tournament as not found', async () => {
    const { deps, request } = setup()

    const result = await deskRegister(deps, faker.string.uuid(), request())

    expect(result).toEqual({ ok: false, kind: 'tournamentNotFound' })
  })

  it('refuses a complete tournament (D-130)', async () => {
    const { deps, state, tournament, request } = setup({ completed: true })

    const result = await deskRegister(deps, tournament.id, request())

    expect(result).toEqual({ ok: false, kind: 'complete' })
    expect(state.bowlers).toHaveLength(0)
  })

  it('refuses a division of another tournament (REG-37)', async () => {
    const other = createDivision()
    const { deps, state, tournament, request } = setup()
    state.divisions.push({ id: other.id, tournamentId: faker.string.uuid() })
    const crossed = {
      ...deps,
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: other },
      ]),
    }

    const failures = await failuresOf(
      deskRegister(crossed, tournament.id, request({ divisionId: other.id })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Registration.DivisionNotInTournament'])
  })

  it('refuses an unknown division', async () => {
    const { deps, tournament, request } = setup()

    const failures = await failuresOf(
      deskRegister(deps, tournament.id, request({ divisionId: faker.string.uuid() })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Division.NotFound'])
  })
})

describe('the request (D-157)', () => {
  it('reads blanks as nothing sent, and defaults the lists', () => {
    const parsed = parseDeskRequest({
      divisionId: faker.string.uuid(),
      average: '',
      bowler: { firstName: 'Ann', dateOfBirth: '', gender: '' },
    })

    expect(parsed).toMatchObject({
      success: true,
      data: { average: null, squadIds: [], sweeperIds: [], superSweeper: false },
    })
  })

  it('refuses an average outside 1 to 300 with the legacy words (REG-16)', () => {
    const base = { divisionId: faker.string.uuid() }

    expect(parseDeskRequest({ ...base, average: 0 })).toMatchObject({
      success: false,
      errors: { average: 'Average must be greater than 0.' },
    })
    expect(parseDeskRequest({ ...base, average: 301 })).toMatchObject({
      success: false,
      errors: { average: 'Average must be less than or equal to 300.' },
    })
    expect(parseDeskRequest({ ...base, average: 300 }).success).toBe(true)
    expect(parseDeskRequest({ ...base, average: 1.5 })).toMatchObject({
      success: false,
      errors: { average: 'Enter a whole number' },
    })
  })

  it('names the field of a bad value', () => {
    expect(
      parseDeskRequest({ divisionId: 'nope', bowler: { dateOfBirth: '03/09/1984' } }),
    ).toMatchObject({
      success: false,
      errors: { divisionId: 'Pick a division', 'bowler.dateOfBirth': expect.any(String) },
    })
  })

  it('files each failure under its field, first message wins, the rest under form', () => {
    expect(
      toFieldErrors([
        validation('Bowler.EmailInvalid', 'Invalid Email'),
        validation('Bowler.EmailInvalid', 'Second'),
        validation('Registration.SquadsRequired', 'Bowler must enter at least one squad'),
        validation('Something.Else', 'Odd'),
      ]),
    ).toEqual({
      'bowler.email': 'Invalid Email',
      squadIds: 'Bowler must enter at least one squad',
      form: 'Odd',
    })
  })
})

describe('the field each failure files under (D-157)', () => {
  it.each([
    ['Bowler.FirstNameRequired', 'bowler.firstName'],
    ['Bowler.LastNameRequired', 'bowler.lastName'],
    ['Bowler.MiddleInitialTooLong', 'bowler.middleInitial'],
    ['Bowler.CityRequired', 'bowler.city'],
    ['Bowler.StateRequired', 'bowler.state'],
    ['Bowler.StateInvalid', 'bowler.state'],
    ['Bowler.ZipCodeInvalid', 'bowler.zipCode'],
    ['Bowler.EmailInvalid', 'bowler.email'],
    ['Bowler.PhoneInvalid', 'bowler.phoneNumber'],
    ['Bowler.DateOfBirthInvalid', 'bowler.dateOfBirth'],
    ['Bowler.UsbcIdInvalid', 'bowler.usbcId'],
    ['Bowler.UsbcIdInUse', 'bowler.usbcId'],
    ['Registration.UsbcIdRequired', 'bowler.usbcId'],
    ['Registration.DateOfBirthRequired', 'bowler.dateOfBirth'],
    ['Registration.BowlerTooYoung', 'bowler.dateOfBirth'],
    ['Registration.BowlerTooOld', 'bowler.dateOfBirth'],
    ['Registration.GenderRequired', 'bowler.gender'],
    ['Registration.GenderInvalid', 'bowler.gender'],
    ['Registration.AverageRequired', 'average'],
    ['Registration.AverageTooLow', 'average'],
    ['Registration.AverageTooHigh', 'average'],
    ['Registration.SquadsRequired', 'squadIds'],
    ['Registration.InvalidSquadIds', 'squadIds'],
    ['Registration.SquadComplete', 'squadIds'],
    ['Squad.Conflict', 'squadIds'],
    ['Registration.InvalidSweeperIds', 'sweeperIds'],
    ['Registration.SweeperComplete', 'sweeperIds'],
    ['Sweeper.Conflict', 'sweeperIds'],
    ['Registration.SuperSweeperNeedsAllSweepers', 'superSweeper'],
    ['Registration.DivisionNotInTournament', 'divisionId'],
    ['Registration.DivisionLocked', 'divisionId'],
    ['Division.NotFound', 'divisionId'],
  ])('puts %s under %s', (code, field) => {
    expect(toFieldErrors([validation(code, 'Said so')])).toEqual({ [field]: 'Said so' })
  })
})

describe('the bowler named in an offer or a conflict (BWL-13, D-159, D-161)', () => {
  it('names a bowler with no suffix without a comma', async () => {
    const bowler = createCommonBowler({ usbcId: '1234-56789', suffix: '' })
    const { deps, tournament, request } = setup({ seed: { bowlers: [bowler] } })

    const result = await deskRegister(
      deps,
      tournament.id,
      request({ bowler: { firstName: 'Joe', lastName: 'Fontaine', usbcId: '1234-56789' } }),
    )

    expect(result).toMatchObject({ kind: 'usbcIdOnFile', bowler: { name: 'Joseph Fontaine' } })
  })

  it('reads the division name of the registration, among several divisions (D-159)', async () => {
    const bowler = createCommonBowler({ usbcId: '' })
    const other = createDivision({ name: 'Seniors' })
    const context = setup({ seed: { bowlers: [bowler] } })
    context.state.divisions.push({ id: other.id, tournamentId: context.tournament.id })
    context.state.registrations.push({
      tournamentId: context.tournament.id,
      registration: {
        id: faker.string.uuid(),
        bowlerId: bowler.id,
        divisionId: context.division.id,
        average: null,
        superSweeper: false,
        sessionIds: [],
      },
    })
    const deps = {
      ...context.deps,
      divisions: createInMemoryDivisionRepository([
        { tournamentId: context.tournament.id, division: other },
        { tournamentId: context.tournament.id, division: context.division },
      ]),
    }

    const result = await deskRegister(
      deps,
      context.tournament.id,
      context.request({ bowlerId: bowler.id }),
    )

    expect(result).toMatchObject({
      kind: 'alreadyRegistered',
      existing: { divisionName: context.division.name },
    })
  })

  it('gives an empty division name when the registration points at a division that is gone', async () => {
    const bowler = createCommonBowler({ usbcId: '' })
    const context = setup({ seed: { bowlers: [bowler] } })
    context.state.registrations.push({
      tournamentId: context.tournament.id,
      registration: {
        id: faker.string.uuid(),
        bowlerId: bowler.id,
        divisionId: faker.string.uuid(),
        average: null,
        superSweeper: false,
        sessionIds: [],
      },
    })

    const result = await deskRegister(
      context.deps,
      context.tournament.id,
      context.request({ bowlerId: bowler.id }),
    )

    expect(result).toMatchObject({ kind: 'alreadyRegistered', existing: { divisionName: '' } })
  })
})

describe('the desk bowler as a patch (D-05, D-157)', () => {
  it('is empty when nothing was typed, whatever the null or missing boxes are', () => {
    expect(toDeskBowlerPatch({})).toEqual({})
    expect(
      toDeskBowlerPatch({
        firstName: null,
        lastName: null,
        street: null,
        city: null,
        state: null,
        zipCode: null,
        email: null,
        usbcId: null,
        gender: '',
        dateOfBirth: '',
      }),
    ).toEqual({})
  })

  it('reads the gender words as Male and Female', () => {
    expect(toDeskBowlerPatch({ gender: 'Male' })).toEqual({ gender: 'Male' })
    expect(toDeskBowlerPatch({ gender: 'Female' })).toEqual({ gender: 'Female' })
  })

  it('keeps only the boxes with text, trimmed, and formats the phone and zip', () => {
    expect(
      toDeskBowlerPatch({
        firstName: ' Ann ',
        zipCode: '02101-1234',
        phoneNumber: '+1 617-555-0100',
        dateOfBirth: '1980-02-03',
      }),
    ).toEqual({
      firstName: 'Ann',
      zipCode: '021011234',
      phoneNumber: '6175550100',
      dateOfBirth: '1980-02-03',
    })
  })
})

describe('the request errors (D-157)', () => {
  it('files a body that is not an object under form', () => {
    expect(parseDeskRequest(null)).toMatchObject({
      success: false,
      errors: { form: expect.any(String) },
    })
  })

  it('says Enter a number for an average that is text, and reads a missing one as null', () => {
    const base = { divisionId: faker.string.uuid() }

    expect(parseDeskRequest({ ...base, average: 'abc' })).toMatchObject({
      success: false,
      errors: { average: 'Enter a number' },
    })
    expect(parseDeskRequest(base)).toMatchObject({ success: true, data: { average: null } })
  })
})
