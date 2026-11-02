import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { sampleRequest } from '../../test/registrationRequests.ts'
import { createPrismaDivisionRepository } from '../divisions/prismaRepository.ts'
import { createPrismaSweeperRepository } from '../sweepers/prismaRepository.ts'
import { createPrismaTournamentRepository } from '../tournaments/prismaRepository.ts'
import { createPrismaRegistrationWriter } from './prismaWriter.ts'
import { register } from './register.ts'
import { parseCreateRequest } from './request.ts'
import { updateRegistration } from './update.ts'
import { parseUpdateRequest } from './updateRequest.ts'

const legacySsn = 'c2VjcmV0LXNzbg=='

describe('Prisma registration writer', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
  })

  async function insertTournament(): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, 'Open', '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', 0)`,
      id,
    )
    return id
  }

  async function insertDivision(tournamentId: string): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, 'Open', 1, ?)`,
      id,
      tournamentId,
    )
    return id
  }

  async function insertSession(tournamentId: string, type = 0, complete = 0): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete,
          SweeperEntryFee, Games, CashRatio)
       VALUES (?, ?, ?, '2026-10-24 09:00:00', 4, 1, 12, ?, ?, ?, ?)`,
      id,
      tournamentId,
      type,
      complete,
      type === 1 ? 25 : null,
      type === 1 ? 3 : null,
      type === 1 ? 4.0 : null,
    )
    return id
  }

  async function insertLegacyBowler(usbcId: string, gender: number | null = 1): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, 'Ray', 'Q', 'Baptiste', 'Jr', '1 Main St', 'Boston', 'MA', '02101',
               'x@example.com', '6175550100', ?, '1980-01-01', ?, ?)`,
      id,
      usbcId,
      gender,
      legacySsn,
    )
    return id
  }

  async function ssnOf(bowlerId: string): Promise<string | undefined> {
    const rows = await client.$queryRawUnsafe<{ ssn: string }[]>(
      'SELECT SocialSecurityNumber AS ssn FROM Bowlers WHERE Id = ?',
      bowlerId,
    )
    return rows[0]?.ssn
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, writer: createPrismaRegistrationWriter(client, captured.logger) }
  }

  const bowlerData = {
    firstName: 'Joe',
    middleInitial: '',
    lastName: 'Fontaine',
    suffix: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    email: 'joe@example.com',
    phoneNumber: '',
    usbcId: '1234-56789',
    dateOfBirth: '1970-01-31',
    gender: 'Male' as const,
  }

  it('saves a new bowler, registration, squads, and payment, and reads them back (API-05, API-06)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const squadId = await insertSession(tournamentId, 0)
    const sweeperId = await insertSession(tournamentId, 1)
    const bowlerId = crypto.randomUUID()
    const registrationId = crypto.randomUUID()

    await writer.save({
      bowler: { id: bowlerId, isNew: true, data: bowlerData },
      registration: {
        id: registrationId,
        isNew: true,
        divisionId,
        average: 185,
        superSweeper: false,
      },
      addSessionIds: [squadId, sweeperId],
      payment: {
        id: crypto.randomUUID(),
        confirmationCode: 'Stripe_ch_1',
        amount: 75,
        createdAtUtc: new Date('2026-10-01T12:00:00Z'),
      },
    })

    const detail = await writer.getDetail(registrationId)
    expect(detail).toMatchObject({
      id: registrationId,
      tournamentId,
      divisionId,
      average: 185,
      superSweeper: false,
      bowler: { id: bowlerId, firstName: 'Joe', gender: 'Male', dateOfBirth: '1970-01-31' },
    })
    expect(detail?.sessionIds.toSorted()).toEqual([squadId, sweeperId].toSorted())
    expect(await writer.findRegistrationIdByPaymentCode('Stripe_ch_1')).toBe(registrationId)
    expect(await writer.findRegistrationIdByPaymentCode('Stripe_other')).toBeUndefined()
  })

  it('stores an empty SSN for a new bowler (BWL-17)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const bowlerId = crypto.randomUUID()

    await writer.save({
      bowler: { id: bowlerId, isNew: true, data: bowlerData },
      registration: {
        id: crypto.randomUUID(),
        isNew: true,
        divisionId,
        average: null,
        superSweeper: false,
      },
      addSessionIds: [],
      payment: null,
    })

    expect(await ssnOf(bowlerId)).toBe('')
  })

  it('never selects the SSN (BWL-17)', async () => {
    const bowlerId = await insertLegacyBowler('1111-22222')
    const row = await client.bowler.findUnique({ where: { id: bowlerId } })
    expect(row).not.toBeNull()
    expect(row).not.toHaveProperty('socialSecurityNumber')
  })

  it('patches only the fields named and leaves the SSN alone (REG-07, D-05, BWL-17)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const bowlerId = await insertLegacyBowler('1234-56789', 1)

    await writer.save({
      bowler: { id: bowlerId, isNew: false, patch: { email: 'new@example.com' } },
      registration: {
        id: crypto.randomUUID(),
        isNew: true,
        divisionId,
        average: null,
        superSweeper: false,
      },
      addSessionIds: [],
      payment: null,
    })

    const [stored] = await writer.findBowlersByUsbcId('1234-56789')
    expect(stored).toMatchObject({
      email: 'new@example.com',
      gender: 'Female',
      dateOfBirth: '1980-01-01',
      suffix: 'Jr',
      phoneNumber: '6175550100',
    })
    expect(await ssnOf(bowlerId)).toBe(legacySsn)
  })

  it('writes one transaction: a duplicate payment code leaves nothing behind (REG-07)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const first = crypto.randomUUID()
    const payment = (id: string) => ({
      id,
      confirmationCode: 'Stripe_dup',
      amount: 5,
      createdAtUtc: new Date(),
    })
    await writer.save({
      bowler: { id: crypto.randomUUID(), isNew: true, data: bowlerData },
      registration: { id: first, isNew: true, divisionId, average: null, superSweeper: false },
      addSessionIds: [],
      payment: payment(crypto.randomUUID()),
    })

    await expect(
      writer.save({
        bowler: { id: crypto.randomUUID(), isNew: true, data: { ...bowlerData, usbcId: '9-9' } },
        registration: {
          id: crypto.randomUUID(),
          isNew: true,
          divisionId,
          average: null,
          superSweeper: false,
        },
        addSessionIds: [],
        payment: payment(crypto.randomUUID()),
      }),
    ).rejects.toThrow()

    expect(await client.bowler.count()).toBe(1)
    expect(await client.registration.count()).toBe(1)
  })

  it("finds a bowler's registration by tournament, with every squad and sweeper (REG-01)", async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const otherTournament = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const bowlerId = await insertLegacyBowler('1234-56789')
    const squadId = await insertSession(tournamentId, 0)
    const registrationId = crypto.randomUUID()
    await writer.save({
      bowler: { id: bowlerId, isNew: false, patch: {} },
      registration: {
        id: registrationId,
        isNew: true,
        divisionId,
        average: 170,
        superSweeper: false,
      },
      addSessionIds: [squadId],
      payment: null,
    })

    expect(await writer.findRegistration(bowlerId, tournamentId)).toEqual({
      id: registrationId,
      bowlerId,
      divisionId,
      average: 170,
      superSweeper: false,
      sessionIds: [squadId],
    })
    expect(await writer.findRegistration(bowlerId, otherTournament)).toBeUndefined()
  })

  it('appends: moves the division and adds squads to the same registration (REG-12)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const newDivisionId = await insertDivision(tournamentId)
    const bowlerId = await insertLegacyBowler('1234-56789')
    const first = await insertSession(tournamentId, 0)
    const second = await insertSession(tournamentId, 0)
    const registrationId = crypto.randomUUID()
    await writer.save({
      bowler: { id: bowlerId, isNew: false, patch: {} },
      registration: {
        id: registrationId,
        isNew: true,
        divisionId,
        average: 170,
        superSweeper: false,
      },
      addSessionIds: [first],
      payment: null,
    })

    await writer.save({
      bowler: { id: bowlerId, isNew: false, patch: {} },
      registration: {
        id: registrationId,
        isNew: false,
        divisionId: newDivisionId,
        average: 199,
        superSweeper: true,
      },
      addSessionIds: [second],
      payment: null,
    })

    const detail = await writer.getDetail(registrationId)
    expect(detail).toMatchObject({ divisionId: newDivisionId, average: 199, superSweeper: true })
    expect(detail?.sessionIds.toSorted()).toEqual([first, second].toSorted())
    expect(await client.registration.count()).toBe(1)
  })

  it('tells squads from sweepers and skips other types (D-108)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const squad = await insertSession(tournamentId, 0)
    const sweeper = await insertSession(tournamentId, 1, 1)
    const odd = await insertSession(tournamentId, 7)

    const sessions = await writer.findSessions([squad, sweeper, odd, crypto.randomUUID()])

    expect(sessions.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: squad, tournamentId, kind: 'squad', complete: false },
        { id: sweeper, tournamentId, kind: 'sweeper', complete: true },
      ].toSorted((a, b) => a.id.localeCompare(b.id)),
    )
    expect(await writer.findSessions([])).toEqual([])
  })

  it('finds the tournament of a division, and nothing for an unknown one', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)

    expect(await writer.findDivisionTournament(divisionId)).toBe(tournamentId)
    expect(await writer.findDivisionTournament(crypto.randomUUID())).toBeUndefined()
  })

  it('reads a bowler with an unknown gender and no birth date as null (API-06)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const bowlerId = await insertLegacyBowler('1234-56789', null)
    await client.$executeRawUnsafe('UPDATE Bowlers SET DateOfBirth = NULL WHERE Id = ?', bowlerId)
    const registrationId = crypto.randomUUID()
    await writer.save({
      bowler: { id: bowlerId, isNew: false, patch: {} },
      registration: {
        id: registrationId,
        isNew: true,
        divisionId,
        average: null,
        superSweeper: false,
      },
      addSessionIds: [],
      payment: null,
    })

    const detail = await writer.getDetail(registrationId)

    expect(detail?.bowler).toMatchObject({ gender: null, dateOfBirth: null })
    expect(await writer.getDetail(crypto.randomUUID())).toBeUndefined()
  })

  it('creates then appends through the rules and keeps the legacy SSN (API-05, BWL-17, D-05)', async () => {
    const { writer, logger } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const squadOne = await insertSession(tournamentId, 0)
    const squadTwo = await insertSession(tournamentId, 0)
    const bowlerId = await insertLegacyBowler('1234-56789', 1)
    const deps = {
      tournaments: createPrismaTournamentRepository(client, logger),
      divisions: createPrismaDivisionRepository(client, logger),
      sweepers: createPrismaSweeperRepository(client, logger),
      writer,
      now: () => new Date('2026-10-01T12:00:00Z'),
    }
    const input = (squads: string[]) => {
      const parsed = parseCreateRequest(
        sampleRequest({
          tournamentId,
          divisionId,
          squads,
          sweepers: [],
          payment: null,
          average: 150,
        }),
      )
      if (!parsed.success) throw new Error('bad test request')
      return parsed.data.registration
    }

    const created = await register(deps, input([squadOne]))
    const appended = await register(deps, input([squadTwo]))

    expect(created).toMatchObject({ ok: true, mode: 'create' })
    expect(appended).toMatchObject({ ok: true, mode: 'append' })
    expect(created.ok && appended.ok && created.registrationId === appended.registrationId).toBe(
      true,
    )
    expect(await client.registration.count()).toBe(1)
    expect(await client.squadRegistration.count()).toBe(2)
    expect(await client.bowler.count()).toBe(1)
    expect(await ssnOf(bowlerId)).toBe(legacySsn)
  })
  it('finds the sessions where a bowler has scores, once each (REG-34, REG-36)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const squadId = await insertSession(tournamentId)
    const otherSquadId = await insertSession(tournamentId)
    const bowlerId = await insertLegacyBowler('1111-22222')
    const otherBowlerId = await insertLegacyBowler('3333-44444')
    for (const [bowler, squad, game] of [
      [bowlerId, squadId, 1],
      [bowlerId, squadId, 2],
      [otherBowlerId, otherSquadId, 1],
    ] as const) {
      await client.$executeRawUnsafe(
        'INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, ?, 200)',
        bowler,
        squad,
        game,
      )
    }

    expect(await writer.findScoredSessionIds(bowlerId)).toEqual([squadId])
    expect(await writer.findScoredSessionIds(crypto.randomUUID())).toEqual([])
  })

  it('updates through the rules: swaps squads, keeps the bowler and SSN, refuses a scored removal (API-07, REG-34, D-05)', async () => {
    const { writer } = setup()
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const squadOne = await insertSession(tournamentId)
    const squadTwo = await insertSession(tournamentId)
    const bowlerId = await insertLegacyBowler('1234-56789')
    const deps = {
      tournaments: createPrismaTournamentRepository(client, setup().logger),
      divisions: createPrismaDivisionRepository(client, setup().logger),
      sweepers: createPrismaSweeperRepository(client, setup().logger),
      writer,
      now: () => new Date('2026-10-01T12:00:00Z'),
    }
    const parsed = parseCreateRequest(
      sampleRequest({ tournamentId, divisionId, squads: [squadOne], sweepers: [], payment: null }),
    )
    if (!parsed.success) throw new Error('bad test request')
    const created = await register(deps, parsed.data.registration)
    if (!created.ok) throw new Error('create failed')
    const change = (changes: Record<string, unknown>) => {
      const update = parseUpdateRequest({
        registration: { registrationId: created.registrationId, ...changes },
      })
      if (!update.success) throw new Error('bad test update')
      return updateRegistration(deps, created.registrationId, update.data.registration)
    }

    const swapped = await change({
      squadIds: [squadTwo],
      average: 170,
      payment: { processingSystem: 'Stripe', confirmationCode: 'ch_7', amount: 40 },
    })

    expect(swapped).toEqual({ ok: true, mode: 'update' })
    const links = await client.squadRegistration.findMany({
      where: { registrationId: created.registrationId },
    })
    expect(links.map((link) => link.squadId)).toEqual([squadTwo])
    expect(
      (await client.registration.findUniqueOrThrow({ where: { id: created.registrationId } }))
        .average,
    ).toBe(170)
    expect(await client.payment.count()).toBe(1)
    expect(await ssnOf(bowlerId)).toBe(legacySsn)
    expect(await client.bowler.count()).toBe(1)

    await client.$executeRawUnsafe(
      'INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, 1, 190)',
      bowlerId,
      squadTwo,
    )
    const refused = await change({ squadIds: [squadOne] })

    expect(refused.ok).toBe(false)
    const after = await client.squadRegistration.findMany({
      where: { registrationId: created.registrationId },
    })
    expect(after.map((link) => link.squadId)).toEqual([squadTwo])
  })
})
