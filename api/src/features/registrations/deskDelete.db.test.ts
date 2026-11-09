import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { planDeskDelete } from './deskDelete.ts'
import { createPrismaRegistrationWriter } from './prismaWriter.ts'

describe('deleting a registration at the desk on MariaDB (REG-19, D-209 to D-212)', () => {
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

  const id = () => crypto.randomUUID()
  const { logger } = createCapturedLogger()
  const writerOf = () => createPrismaRegistrationWriter(client, logger)

  async function tournament(completed = false) {
    const tournamentId = id()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, 'Open', '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', ?)`,
      tournamentId,
      completed ? 1 : 0,
    )
    const divisionId = id()
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, 'Scratch', 1, ?)`,
      divisionId,
      tournamentId,
    )
    // A squad with its own fee, one that falls back to the tournament's, and a sweeper.
    const session = async (type: number, date: string, squadFee: number | null) => {
      const sessionId = id()
      await client.$executeRawUnsafe(
        `INSERT INTO Squads
           (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete,
            SquadEntryFee, SweeperEntryFee, Games, CashRatio)
         VALUES (?, ?, ?, ?, 4, 1, 12, 0, ?, ?, ?, ?)`,
        sessionId,
        tournamentId,
        type,
        date,
        type === 0 ? squadFee : null,
        type === 1 ? 25 : null,
        type === 1 ? 3 : null,
        type === 1 ? 4.0 : null,
      )
      return sessionId
    }
    return {
      tournamentId,
      divisionId,
      ownFee: await session(0, '2026-10-24 19:00:00', 65),
      tournamentFee: await session(0, '2026-10-24 09:00:00', null),
      sweeper: await session(1, '2026-10-25 15:00:00', null),
    }
  }

  async function register(
    world: Awaited<ReturnType<typeof tournament>>,
    payments: { code: string; amount: number }[] = [],
  ) {
    const bowlerId = id()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, 'Maria', 'Q', 'Gonzalez', '', '1 Main St', 'Boston', 'MA', '02101',
               'x@example.com', '6175550100', '1234-56789', '1980-01-01', 1, 'c2VjcmV0')`,
      bowlerId,
    )
    const registrationId = id()
    await client.$executeRawUnsafe(
      `INSERT INTO Registrations (Id, BowlerId, DivisionId, Average, SuperSweeper)
       VALUES (?, ?, ?, 180, 0)`,
      registrationId,
      bowlerId,
      world.divisionId,
    )
    for (const sessionId of [world.ownFee, world.tournamentFee, world.sweeper]) {
      await client.$executeRawUnsafe(
        `INSERT INTO SquadRegistration (RegistrationId, SquadId, LaneAssignment) VALUES (?, ?, '')`,
        registrationId,
        sessionId,
      )
    }
    for (const payment of payments) {
      await client.$executeRawUnsafe(
        `INSERT INTO Payments (Id, CreatedAtUtc, RegistrationId, ConfirmationCode, Amount)
         VALUES (?, '2026-10-01 12:00:00', ?, ?, ?)`,
        id(),
        registrationId,
        payment.code,
        payment.amount,
      )
    }
    return { bowlerId, registrationId }
  }

  const score = (bowlerId: string, squadId: string) =>
    client.$executeRawUnsafe(
      `INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, 1, 180)`,
      bowlerId,
      squadId,
    )

  const count = async (table: string) => {
    const rows = await client.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM ${table}`)
    return Number(rows[0]?.n ?? 0)
  }

  it('reads each entry with its own or the tournament fee, and only real payments (D-212)', async () => {
    const world = await tournament()
    const { registrationId } = await register(world, [
      { code: 'BowlingSite_abc123', amount: 140 },
      { code: 'Manual_0190', amount: 0 },
      { code: 'BowlingSite_zero', amount: 0 },
    ])

    const facts = await writerOf().getDeskDeleteFacts(registrationId, world.tournamentId)

    expect(facts).toEqual({
      bowlerName: 'Maria Gonzalez',
      divisionName: 'Scratch',
      tournamentComplete: false,
      hasScores: false,
      entries: [
        { id: world.tournamentFee, kind: 'squad', date: '2026-10-24T09:00:00', entryFee: 50 },
        { id: world.ownFee, kind: 'squad', date: '2026-10-24T19:00:00', entryFee: 65 },
        { id: world.sweeper, kind: 'sweeper', date: '2026-10-25T15:00:00', entryFee: 25 },
      ],
      payments: [{ system: 'BowlingSite', amount: 140 }],
    })
    expect(JSON.stringify(facts)).not.toMatch(/abc123|secret/)
  })

  it('reads nothing for an unknown registration or another tournament (D-209)', async () => {
    const world = await tournament()
    const other = await tournament()
    const { registrationId } = await register(world)

    expect(await writerOf().getDeskDeleteFacts(id(), world.tournamentId)).toBeUndefined()
    expect(await writerOf().getDeskDeleteFacts(registrationId, other.tournamentId)).toBeUndefined()
  })

  it('deletes the entries, payments, and registration, and keeps the bowler (REG-19, D-211)', async () => {
    const world = await tournament()
    const { registrationId } = await register(world, [{ code: 'BowlingSite_abc123', amount: 140 }])

    const plan = await writerOf().removeForDesk(registrationId, world.tournamentId, (facts) =>
      planDeskDelete(facts, 140),
    )

    expect(plan).toEqual({ kind: 'delete' })
    expect(await count('Registrations')).toBe(0)
    expect(await count('SquadRegistration')).toBe(0)
    expect(await count('Payments')).toBe(0)
    expect(await count('Bowlers')).toBe(1)
    expect(await count('Squads')).toBe(3)
  })

  it('removes only the one registration (REG-19)', async () => {
    const world = await tournament()
    const gone = await register(world, [{ code: 'BowlingSite_one', amount: 100 }])
    await register(world, [{ code: 'BowlingSite_two', amount: 100 }])

    await writerOf().removeForDesk(gone.registrationId, world.tournamentId, (facts) =>
      planDeskDelete(facts, 100),
    )

    expect(await count('Registrations')).toBe(1)
    expect(await count('SquadRegistration')).toBe(3)
    expect(await count('Payments')).toBe(1)
  })

  it('deletes nothing when it only warns about a real payment (D-210)', async () => {
    const world = await tournament()
    const { registrationId } = await register(world, [{ code: 'BowlingSite_abc123', amount: 140 }])

    const plan = await writerOf().removeForDesk(registrationId, world.tournamentId, (facts) =>
      planDeskDelete(facts, undefined),
    )

    expect(plan).toMatchObject({ kind: 'warn', paid: 140 })
    expect(await count('Registrations')).toBe(1)
    expect(await count('Payments')).toBe(1)
    expect(await count('SquadRegistration')).toBe(3)
  })

  it('refuses a bowler with a score in this tournament and deletes nothing (REG-19, D-211)', async () => {
    const world = await tournament()
    const { registrationId, bowlerId } = await register(world)
    await score(bowlerId, world.ownFee)

    const plan = await writerOf().removeForDesk(registrationId, world.tournamentId, (facts) =>
      planDeskDelete(facts, undefined),
    )

    expect(plan).toMatchObject({ kind: 'refused', errors: { scores: expect.any(String) } })
    expect(await count('Registrations')).toBe(1)
  })

  it('ignores a score the bowler has in another tournament (REG-19)', async () => {
    const world = await tournament()
    const other = await tournament()
    const { registrationId, bowlerId } = await register(world)
    await score(bowlerId, other.ownFee)

    const plan = await writerOf().removeForDesk(registrationId, world.tournamentId, (facts) =>
      planDeskDelete(facts, undefined),
    )

    expect(plan).toEqual({ kind: 'delete' })
  })

  it('refuses a complete tournament (D-130, D-211)', async () => {
    const world = await tournament(true)
    const { registrationId } = await register(world)

    const plan = await writerOf().removeForDesk(registrationId, world.tournamentId, (facts) =>
      planDeskDelete(facts, undefined),
    )

    expect(plan).toMatchObject({ kind: 'refused', errors: { tournament: expect.any(String) } })
    expect(await count('Registrations')).toBe(1)
  })

  it('answers undefined for an unknown registration and runs no decision (D-209)', async () => {
    const world = await tournament()
    let asked = false

    const plan = await writerOf().removeForDesk(id(), world.tournamentId, (facts) => {
      asked = true
      return planDeskDelete(facts, undefined)
    })

    expect(plan).toBeUndefined()
    expect(asked).toBe(false)
  })

  it('lets one of two desks that delete at once win, and tells the other it is gone (D-211)', async () => {
    const world = await tournament()
    const { registrationId } = await register(world)
    const writer = writerOf()

    const results = await Promise.all([
      writer.removeForDesk(registrationId, world.tournamentId, (facts) =>
        planDeskDelete(facts, undefined),
      ),
      writer.removeForDesk(registrationId, world.tournamentId, (facts) =>
        planDeskDelete(facts, undefined),
      ),
    ])

    expect(results.filter((plan) => plan?.kind === 'delete')).toHaveLength(1)
    expect(results.filter((plan) => plan === undefined)).toHaveLength(1)
    expect(await count('Registrations')).toBe(0)
  })
})
