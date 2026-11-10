import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaLaneWriter } from './prismaWriter.ts'

describe('Prisma lane writer', () => {
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

  async function insertTournament(completed = 0): Promise<string> {
    const { id, name } = createTournament()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, ?, '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', ?)`,
      id,
      name,
      completed,
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

  async function insertSession(
    tournamentId: string,
    fields: { type?: number; complete?: number; maxPerPair?: number } = {},
  ): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete)
       VALUES (?, ?, ?, '2026-10-24 09:00:00', ?, 1, 8, ?)`,
      id,
      tournamentId,
      fields.type ?? 0,
      fields.maxPerPair ?? 4,
      fields.complete ?? 0,
    )
    return id
  }

  async function insertEntry(
    divisionId: string,
    sessionId: string,
    position = '',
  ): Promise<string> {
    const bowlerId = crypto.randomUUID()
    const registrationId = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, 'Ray', 'Q', 'Baptiste', '', '1 Main St', 'Boston', 'MA', '02101', 'x@example.com',
               '6175550100', ?, '1980-01-01', 0, 'c2VjcmV0LXNzbg==')`,
      bowlerId,
      bowlerId.slice(0, 10),
    )
    await client.$executeRawUnsafe(
      `INSERT INTO Registrations (Id, BowlerId, DivisionId, Average, SuperSweeper)
       VALUES (?, ?, ?, 190, 0)`,
      registrationId,
      bowlerId,
      divisionId,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO SquadRegistration (RegistrationId, SquadId, LaneAssignment) VALUES (?, ?, ?)`,
      registrationId,
      sessionId,
      position,
    )
    return registrationId
  }

  const storedPosition = async (registrationId: string, sessionId: string) => {
    const [row] = await client.$queryRawUnsafe<{ LaneAssignment: string | null }[]>(
      'SELECT LaneAssignment FROM SquadRegistration WHERE RegistrationId = ? AND SquadId = ?',
      registrationId,
      sessionId,
    )
    return row?.LaneAssignment
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, writer: createPrismaLaneWriter(client, captured.logger) }
  }

  const move = (
    tournamentId: string,
    sessionId: string,
    registrationId: string,
    lane: number | null,
    kind: 'squad' | 'sweeper' = 'squad',
  ) => ({ tournamentId, kind, sessionId, registrationId, lane })

  it('writes the first free seat of the pair (LAN-20, D-56)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const first = await insertEntry(divisionId, sessionId, '1A')
    const second = await insertEntry(divisionId, sessionId)
    const { writer } = setup()

    await expect(writer.move(move(tournamentId, sessionId, second, 1))).resolves.toEqual({
      type: 'move',
      position: '2C',
    })
    expect(await storedPosition(second, sessionId)).toBe('2C')
    expect(await storedPosition(first, sessionId)).toBe('1A')
  })

  it('writes an empty text on a null lane (LAN-09)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const entry = await insertEntry(divisionId, sessionId, '3A')
    const { writer } = setup()

    await expect(writer.move(move(tournamentId, sessionId, entry, null))).resolves.toEqual({
      type: 'move',
      position: '',
    })
    expect(await storedPosition(entry, sessionId)).toBe('')
  })

  it('writes nothing for the pair the bowler is in (LAN-06)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const entry = await insertEntry(divisionId, sessionId, '2C')
    const { writer } = setup()

    await expect(writer.move(move(tournamentId, sessionId, entry, 1))).resolves.toEqual({
      type: 'unchanged',
      position: '2C',
    })
  })

  it('moves a bowler on a sweeper the same way (LAN-20)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId, { type: 1 })
    const entry = await insertEntry(divisionId, sessionId, '')
    const { writer } = setup()

    await expect(writer.move(move(tournamentId, sessionId, entry, 3, 'sweeper'))).resolves.toEqual({
      type: 'move',
      position: '3A',
    })
  })

  it('answers 404 for a sweeper id under squads and the reverse (LAN-14)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId, { type: 1 })
    const entry = await insertEntry(divisionId, sessionId, '')
    const { writer } = setup()

    await expect(writer.move(move(tournamentId, sessionId, entry, 1, 'squad'))).resolves.toEqual({
      notFound: 'session',
    })
  })

  it('answers not found for an unknown tournament, and for a session of another tournament (LAN-14)', async () => {
    const tournamentId = await insertTournament()
    const other = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const entry = await insertEntry(divisionId, sessionId, '')
    const { writer } = setup()

    await expect(writer.move(move(crypto.randomUUID(), sessionId, entry, 1))).resolves.toEqual({
      notFound: 'tournament',
    })
    await expect(writer.move(move(other, sessionId, entry, 1))).resolves.toEqual({
      notFound: 'session',
    })
  })

  it('refuses a complete session and a complete tournament, and writes nothing (LAN-13, D-10)', async () => {
    const tournamentId = await insertTournament()
    const completeTournament = await insertTournament(1)
    const divisionId = await insertDivision(tournamentId)
    const otherDivision = await insertDivision(completeTournament)
    const done = await insertSession(tournamentId, { complete: 1 })
    const frozen = await insertSession(completeTournament)
    const entry = await insertEntry(divisionId, done, '')
    const frozenEntry = await insertEntry(otherDivision, frozen, '')
    const { writer } = setup()

    await expect(writer.move(move(tournamentId, done, entry, 1))).resolves.toMatchObject({
      type: 'refused',
    })
    await expect(
      writer.move(move(completeTournament, frozen, frozenEntry, 1)),
    ).resolves.toMatchObject({ type: 'refused' })
    expect(await storedPosition(entry, done)).toBe('')
    expect(await storedPosition(frozenEntry, frozen)).toBe('')
  })

  it('refuses a registration that is not on the session (LAN-05)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const elsewhere = await insertSession(tournamentId)
    const entry = await insertEntry(divisionId, elsewhere, '')
    const { writer } = setup()

    await expect(writer.move(move(tournamentId, sessionId, entry, 1))).resolves.toEqual({
      type: 'notOnSession',
    })
  })

  it('gives the last seat to one of two desks and "full" to the other (Q-28)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId, { maxPerPair: 2 })
    await insertEntry(divisionId, sessionId, '1A')
    const racers = await Promise.all(
      Array.from({ length: 3 }, () => insertEntry(divisionId, sessionId)),
    )
    const { writer } = setup()

    const results = await Promise.all(
      racers.map((registrationId) => writer.move(move(tournamentId, sessionId, registrationId, 1))),
    )

    expect(results.filter((result) => 'type' in result && result.type === 'move')).toHaveLength(1)
    expect(results.filter((result) => 'type' in result && result.type === 'full')).toHaveLength(2)
    const [row] = await client.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM SquadRegistration WHERE SquadId = ? AND LaneAssignment <> ''`,
      sessionId,
    )
    expect(Number(row?.n)).toBe(2)
  })
})
