import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'
import { createDivision, createSweeper, createTournament } from '../../test/factories.ts'
import { sampleRequest } from '../../test/registrationRequests.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import type { Division } from '../divisions/types.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { register } from './register.ts'
import { parseCreateRequest, type RegistrationInput } from './request.ts'
import {
  createInMemoryRegistrationWriter,
  type InMemoryWriterSeed,
  type StoredSession,
} from './writer.ts'

const now = new Date('2026-10-01T12:00:00Z')

interface Options {
  division?: Partial<Division>
  seed?: InMemoryWriterSeed
  sweeperCount?: number
}

/** A tournament with an open division, two open squads, and one open sweeper. */
function setup({ division: divisionOverrides, seed, sweeperCount = 1 }: Options = {}) {
  const tournament = createTournament({ startDate: '2026-10-23' })
  const division = createDivision(divisionOverrides)
  const squads: StoredSession[] = [1, 2].map(() => session('squad', tournament.id))
  const sweepers: StoredSession[] = Array.from({ length: sweeperCount }, () =>
    session('sweeper', tournament.id),
  )
  const { writer, state } = createInMemoryRegistrationWriter({
    divisions: [{ id: division.id, tournamentId: tournament.id }],
    sessions: [...squads, ...sweepers],
    ...seed,
  })
  const deps = {
    tournaments: createInMemoryTournamentRepository([tournament]),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
    sweepers: createInMemorySweeperRepository(
      sweepers.map((s) => ({ tournamentId: tournament.id, sweeper: createSweeper({ id: s.id }) })),
    ),
    writer,
    now: () => now,
  }
  function input(overrides: Record<string, unknown> = {}): RegistrationInput {
    const body = sampleRequest({
      tournamentId: tournament.id,
      divisionId: division.id,
      squads: [squads[0]?.id],
      sweepers: [],
      payment: null,
      ...overrides,
    })
    const parsed = parseCreateRequest(body)
    if (!parsed.success) throw new Error(`bad test input: ${JSON.stringify(parsed.failures)}`)
    return parsed.data.registration
  }
  return { deps, state, tournament, division, squads, sweepers, input }
}

function session(kind: 'squad' | 'sweeper', tournamentId: string, complete = false): StoredSession {
  return { id: faker.string.uuid(), tournamentId, kind, complete }
}

async function failuresOf(result: ReturnType<typeof register>) {
  const outcome = await result
  if (outcome.ok) throw new Error('expected a failure')
  return outcome.failures
}

describe('creating a registration (REG-01, REG-08, API-05)', () => {
  it('saves the bowler, the registration, and its squad', async () => {
    const { deps, state, input, squads, division } = setup()

    const result = await register(deps, input())

    expect(result).toMatchObject({ ok: true, mode: 'create' })
    expect(state.bowlers).toHaveLength(1)
    expect(state.bowlers[0]).toMatchObject({ firstName: 'Joe', usbcId: '1234-56789' })
    expect(state.registrations).toHaveLength(1)
    expect(state.registrations[0]?.registration).toMatchObject({
      divisionId: division.id,
      average: 185,
      superSweeper: false,
      sessionIds: [squads[0]?.id],
    })
  })

  it('returns the new registration id', async () => {
    const { deps, state, input } = setup()

    const result = await register(deps, input())

    expect(result.ok && result.registrationId).toBe(state.registrations[0]?.registration.id)
  })

  it('stores a missing gender as Male, and "F" as Female (API-10, D-113)', async () => {
    const first = setup()
    const base = sampleRequest().registration.bowler
    await register(first.deps, first.input({ bowler: { ...base, gender: undefined } }))
    expect(first.state.bowlers[0]?.gender).toBe('Male')

    const second = setup()
    await register(second.deps, second.input({ bowler: { ...base, gender: 'F' } }))
    expect(second.state.bowlers[0]?.gender).toBe('Female')
  })

  it('stores a payment as <system>_<code> with the server time (REG-08, PAY-02, PAY-04)', async () => {
    const { deps, state, input } = setup()

    await register(
      deps,
      input({ payment: { processingSystem: 'Stripe', confirmationCode: 'ch_1', amount: 75 } }),
    )

    expect(state.payments).toEqual([
      { registrationId: state.registrations[0]?.registration.id, confirmationCode: 'Stripe_ch_1' },
    ])
  })

  it('saves no payment when none comes (REG-08)', async () => {
    const { deps, state, input } = setup()
    await register(deps, input())
    expect(state.payments).toEqual([])
  })

  it('reuses a bowler who has a record from another tournament, and patches it (REG-07, D-05)', async () => {
    const stored = createCommonBowler({ usbcId: '1234-56789' })
    const { deps, state, input } = setup({ seed: { bowlers: [stored] } })
    const base = sampleRequest().registration.bowler

    const result = await register(
      deps,
      input({
        bowler: { ...base, gender: null, dateOfBirth: null, suffix: '', email: 'new@example.com' },
      }),
    )

    expect(result).toMatchObject({ ok: true, mode: 'create' })
    expect(state.bowlers).toHaveLength(1)
    expect(state.bowlers[0]).toMatchObject({
      id: stored.id,
      email: 'new@example.com',
      gender: 'Female',
      dateOfBirth: '1960-05-05',
      suffix: 'Jr',
    })
  })

  it('fails when two bowler records share the USBC id', async () => {
    const a = createCommonBowler({ usbcId: '1234-56789' })
    const b = createCommonBowler({ usbcId: '1234-56789' })
    const { deps, input } = setup({ seed: { bowlers: [a, b] } })

    const failures = await failuresOf(register(deps, input()))

    expect(failures).toEqual([
      {
        kind: 'other',
        code: 'Bowler.Duplicate',
        description: 'More than one bowler record has this USBC ID.',
      },
    ])
  })
})

describe('request lookups', () => {
  it('fails with a non-validation error for an unknown tournament (API-12)', async () => {
    const { deps, input } = setup()
    const failures = await failuresOf(register(deps, input({ tournamentId: faker.string.uuid() })))
    expect(failures).toEqual([
      {
        kind: 'other',
        code: 'Tournament.NotFound',
        description: 'The specified tournament does not exist.',
      },
    ])
  })

  it('fails with a non-validation error for an unknown division (API-12)', async () => {
    const { deps, input } = setup()
    const failures = await failuresOf(register(deps, input({ divisionId: faker.string.uuid() })))
    expect(failures).toEqual([
      {
        kind: 'other',
        code: 'Division.NotFound',
        description: 'The specified division does not exist.',
      },
    ])
  })

  it('refuses a division of another tournament (D-108)', async () => {
    const elsewhere = createDivision()
    const { deps, input } = setup({
      seed: { divisions: [{ id: 'unused', tournamentId: 'unused' }] },
    })
    deps.writer.findDivisionTournament = () => Promise.resolve(faker.string.uuid())

    const failures = await failuresOf(register(deps, input({ divisionId: elsewhere.id })))

    expect(failures).toEqual([
      {
        kind: 'validation',
        code: 'Registration.DivisionNotInTournament',
        description: 'Division ID is not valid for the tournament.',
      },
    ])
  })
})

describe('squads and sweepers (D-108, REG-03, REG-06)', () => {
  it('refuses a squad of another tournament or an unknown one (D-108)', async () => {
    const stranger = session('squad', faker.string.uuid())
    const { deps, input } = setup({ seed: { sessions: [stranger] } })

    const failures = await failuresOf(register(deps, input({ squads: [stranger.id] })))

    expect(failures).toContainEqual({
      kind: 'validation',
      code: 'Registration.InvalidSquadIds',
      description: 'Invalid squad IDs',
    })
    const unknown = await failuresOf(register(deps, input({ squads: [faker.string.uuid()] })))
    expect(unknown.map((f) => f.code)).toContain('Registration.InvalidSquadIds')
  })

  it('refuses a sweeper listed as a squad, and a squad listed as a sweeper (D-108)', async () => {
    const { deps, input, sweepers, squads } = setup()

    const asSquad = await failuresOf(register(deps, input({ squads: [sweepers[0]?.id] })))
    const asSweeper = await failuresOf(register(deps, input({ sweepers: [squads[1]?.id] })))

    expect(asSquad.map((f) => f.code)).toContain('Registration.InvalidSquadIds')
    expect(asSweeper).toContainEqual({
      kind: 'validation',
      code: 'Registration.InvalidSweeperIds',
      description: 'Invalid sweeper IDs',
    })
    expect(asSquad.map((f) => f.code)).toContain('Registration.SquadsRequired')
  })

  it('refuses a squad or sweeper that is complete (D-108)', async () => {
    const doneSquad = session('squad', 'x', true)
    const doneSweeper = session('sweeper', 'x', true)
    const { deps, input, tournament } = setup({
      seed: {
        sessions: [
          { ...doneSquad, tournamentId: 'overwritten' },
          { ...doneSweeper, tournamentId: 'overwritten' },
        ],
      },
    })
    // The seed replaced the open sessions; rebuild them inside this tournament.
    const inTournament = (s: StoredSession) => ({ ...s, tournamentId: tournament.id })
    deps.writer.findSessions = (ids) =>
      Promise.resolve([doneSquad, doneSweeper].map(inTournament).filter((s) => ids.includes(s.id)))

    const failures = await failuresOf(
      register(deps, input({ squads: [doneSquad.id], sweepers: [doneSweeper.id] })),
    )

    expect(failures).toEqual(
      expect.arrayContaining([
        {
          kind: 'validation',
          code: 'Registration.SquadComplete',
          description: 'Cannot add squad(s) that are already complete.',
        },
        {
          kind: 'validation',
          code: 'Registration.SweeperComplete',
          description: 'Cannot add sweeper(s) that are already complete.',
        },
      ]),
    )
  })

  it('lets a super sweeper enter every sweeper, and refuses fewer (REG-06)', async () => {
    const all = setup({ sweeperCount: 2 })
    const ok = await register(
      all.deps,
      all.input({ superSweeper: true, sweepers: all.sweepers.map((s) => s.id) }),
    )
    expect(ok.ok).toBe(true)

    const some = setup({ sweeperCount: 2 })
    const failures = await failuresOf(
      register(some.deps, some.input({ superSweeper: true, sweepers: [some.sweepers[0]?.id] })),
    )
    expect(failures).toEqual([
      {
        kind: 'validation',
        code: 'Registration.SuperSweeperNeedsAllSweepers',
        description: 'Must enter all sweepers to enter Super Sweeper',
      },
    ])
  })
})

describe('eligibility and bowler rules are a 400 (D-107, REG-04, REG-05)', () => {
  it('refuses an average below the division minimum', async () => {
    const { deps, input, state } = setup({ division: { minimumAverage: 190 } })

    const failures = await failuresOf(register(deps, input()))

    expect(failures.map((f) => [f.kind, f.description])).toEqual([
      ['validation', 'Minimum average requirement for division not met'],
    ])
    expect(state.bowlers).toEqual([])
  })

  it('refuses a bad bowler (BWL-10)', async () => {
    const { deps, input } = setup()
    const base = sampleRequest().registration.bowler

    const failures = await failuresOf(register(deps, input({ bowler: { ...base, usbcId: '123' } })))

    expect(failures.map((f) => f.description)).toEqual(['Invalid USBC Id'])
  })

  it('checks the stored birth date of a returning bowler (D-05)', async () => {
    const stored = createCommonBowler({ usbcId: '1234-56789', dateOfBirth: '1990-01-01' })
    const { deps, input } = setup({ division: { minimumAge: 50 }, seed: { bowlers: [stored] } })
    const base = sampleRequest().registration.bowler

    const failures = await failuresOf(
      register(deps, input({ bowler: { ...base, dateOfBirth: null } })),
    )

    expect(failures.map((f) => f.description)).toEqual(['Bowler too young for selected division'])
  })
})

describe('appending to an existing registration (REG-10 to REG-14)', () => {
  function withRegistration(options: Options & { alsoOnSweeper?: boolean } = {}) {
    const base = setup(options)
    const bowler = createCommonBowler({ usbcId: '1234-56789' })
    const registration = {
      id: faker.string.uuid(),
      bowlerId: bowler.id,
      divisionId: base.division.id,
      average: 170,
      superSweeper: false,
      sessionIds: [
        base.squads[0]?.id ?? '',
        ...(options.alsoOnSweeper ? [base.sweepers[0]?.id ?? ''] : []),
      ],
    }
    const { writer, state } = createInMemoryRegistrationWriter({
      divisions: [{ id: base.division.id, tournamentId: base.tournament.id }],
      sessions: [...base.squads, ...base.sweepers],
      bowlers: [bowler],
      registrations: [{ tournamentId: base.tournament.id, registration }],
    })
    return { ...base, deps: { ...base.deps, writer }, state, registration }
  }

  it('adds the new squad to the same registration and returns its id (REG-01, API-11)', async () => {
    const { deps, state, input, registration, squads } = withRegistration()

    const result = await register(deps, input({ squads: [squads[1]?.id] }))

    expect(result).toEqual({ ok: true, registrationId: registration.id, mode: 'append' })
    expect(state.registrations).toHaveLength(1)
    expect(state.registrations[0]?.registration.sessionIds).toEqual([squads[0]?.id, squads[1]?.id])
  })

  it('refuses a squad already on the registration (REG-11)', async () => {
    const { deps, input, squads } = withRegistration()

    const failures = await failuresOf(register(deps, input({ squads: [squads[0]?.id] })))

    expect(failures.map((f) => f.description)).toEqual([
      'The specified squads are already registered.',
    ])
  })

  it('refuses a sweeper already on the registration (REG-11)', async () => {
    const base = setup()
    const sweeperId = base.sweepers[0]?.id ?? ''
    const { deps, input, squads } = withRegistration()
    const [, second] = squads
    deps.writer.findRegistration = () =>
      Promise.resolve({
        id: 'r',
        bowlerId: 'b',
        divisionId: base.division.id,
        average: null,
        superSweeper: false,
        sessionIds: [sweeperId],
      })
    deps.writer.findSessions = (ids) =>
      Promise.resolve([...base.squads, ...base.sweepers].filter((s) => ids.includes(s.id)))

    const failures = await failuresOf(
      register(deps, input({ squads: [second?.id], sweepers: [sweeperId] })),
    )

    expect(failures.map((f) => f.description)).toContain(
      'The specified sweepers are already registered.',
    )
  })

  it('moves the registration to the requested division (REG-12)', async () => {
    const other = createDivision()
    const { deps, state, input, squads, tournament } = withRegistration()
    deps.writer.findDivisionTournament = (id) =>
      Promise.resolve(id === other.id ? tournament.id : undefined)
    deps.divisions.listByTournament = () => Promise.resolve([other])

    await register(deps, input({ divisionId: other.id, squads: [squads[1]?.id] }))

    expect(state.registrations[0]?.registration.divisionId).toBe(other.id)
  })

  it('keeps the old average when the request has none (REG-12)', async () => {
    const { deps, state, input, squads } = withRegistration()

    await register(deps, input({ average: null, squads: [squads[1]?.id] }))

    expect(state.registrations[0]?.registration.average).toBe(170)
  })

  it('takes the new average when the request has one (REG-12)', async () => {
    const { deps, state, input, squads } = withRegistration()

    await register(deps, input({ average: 199, squads: [squads[1]?.id] }))

    expect(state.registrations[0]?.registration.average).toBe(199)
  })

  it('patches the bowler and adds the payment (REG-14, D-05)', async () => {
    const { deps, state, input, squads } = withRegistration()
    const base = sampleRequest().registration.bowler

    await register(
      deps,
      input({
        squads: [squads[1]?.id],
        bowler: { ...base, gender: null, suffix: null, email: 'again@example.com' },
        payment: { processingSystem: 'Stripe', confirmationCode: 'ch_2', amount: 25 },
      }),
    )

    expect(state.bowlers[0]).toMatchObject({
      email: 'again@example.com',
      suffix: 'Jr',
      gender: 'Female',
    })
    expect(state.payments).toHaveLength(1)
  })

  it('counts the sweepers already on the registration toward a super sweeper (REG-13)', async () => {
    const { deps, input, squads } = withRegistration({ alsoOnSweeper: true })

    const result = await register(deps, input({ superSweeper: true, squads: [squads[1]?.id] }))

    expect(result).toMatchObject({ ok: true, mode: 'append' })
  })

  it('refuses a super sweeper whose combined sweepers fall short (REG-13)', async () => {
    const { deps, input, squads } = withRegistration()

    const failures = await failuresOf(
      register(deps, input({ superSweeper: true, squads: [squads[1]?.id] })),
    )

    expect(failures.map((f) => f.code)).toEqual(['Registration.SuperSweeperNeedsAllSweepers'])
  })

  it('counts the squads already entered toward the one-squad rule (REG-03, REG-13)', async () => {
    const { deps, input, sweepers } = withRegistration()

    const failures = await failuresOf(register(deps, input({ squads: [sweepers[0]?.id] })))

    expect(failures.map((f) => f.code)).toEqual(['Registration.InvalidSquadIds'])
  })
})

describe('a repeated payment code is a retry (PAY-03, D-109)', () => {
  it('returns the existing registration and writes nothing', async () => {
    const existingId = faker.string.uuid()
    const { deps, state, input } = setup({
      seed: { payments: [{ registrationId: existingId, confirmationCode: 'Stripe_ch_9' }] },
    })

    const result = await register(
      deps,
      input({ payment: { processingSystem: 'Stripe', confirmationCode: 'ch_9', amount: 75 } }),
    )

    expect(result).toEqual({ ok: true, registrationId: existingId, mode: 'retry' })
    expect(state.bowlers).toEqual([])
    expect(state.registrations).toEqual([])
    expect(state.payments).toHaveLength(1)
  })
})
