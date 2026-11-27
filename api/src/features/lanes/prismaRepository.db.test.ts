import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaLaneRepository } from './prismaRepository.ts'

describe('Prisma lane repository', () => {
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
    const { id, name } = createTournament()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, ?, '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', 0)`,
      id,
      name,
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

  async function insertSession(tournamentId: string): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete)
       VALUES (?, ?, 0, '2026-10-24 09:00:00', 4, 1, 12, 0)`,
      id,
      tournamentId,
    )
    return id
  }

  async function insertEntry(
    divisionId: string,
    sessionId: string,
    fields: {
      first?: string
      last?: string
      suffix?: string
      average?: number | null
      position?: string
      superSweeper?: number
    } = {},
  ): Promise<string> {
    const bowlerId = crypto.randomUUID()
    const registrationId = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, ?, 'Q', ?, ?, '1 Main St', 'Boston', 'MA', '02101', 'x@example.com',
               '6175550100', '1190-55820', '1980-01-01', 0, 'c2VjcmV0LXNzbg==')`,
      bowlerId,
      fields.first ?? 'Ray',
      fields.last ?? 'Baptiste',
      fields.suffix ?? '',
    )
    await client.$executeRawUnsafe(
      `INSERT INTO Registrations (Id, BowlerId, DivisionId, Average, SuperSweeper)
       VALUES (?, ?, ?, ?, ?)`,
      registrationId,
      bowlerId,
      divisionId,
      fields.average === undefined ? 190 : fields.average,
      fields.superSweeper ?? 0,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO SquadRegistration (RegistrationId, SquadId, LaneAssignment) VALUES (?, ?, ?)`,
      registrationId,
      sessionId,
      fields.position ?? '',
    )
    return registrationId
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, repository: createPrismaLaneRepository(client, captured.logger) }
  }

  it('reads the bowler, division, average, flag, and stored position (LAN-01, LAN-11)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const registrationId = await insertEntry(divisionId, sessionId, {
      suffix: 'Jr',
      average: 212,
      position: '15A',
      superSweeper: 1,
    })
    const [stored] = await client.$queryRawUnsafe<{ BowlerId: string }[]>(
      'SELECT BowlerId FROM Registrations WHERE Id = ?',
      registrationId,
    )
    const { repository } = setup()

    await expect(repository.listEntries(sessionId)).resolves.toEqual([
      {
        registrationId,
        bowlerId: stored?.BowlerId,
        divisionId,
        average: 212,
        providedAverage: 212,
        averageStatus: 'unverified',
        averageNote: null,
        firstName: 'Ray',
        lastName: 'Baptiste',
        suffix: 'Jr',
        name: 'Ray Baptiste, Jr',
        superSweeper: true,
        position: '15A',
      },
    ])
  })

  it('reads the lanes out of play of one session (OOP-01)', async () => {
    const sessionId = crypto.randomUUID()
    await client.laneOutOfPlay.createMany({
      data: [
        { squadId: sessionId, lane: 3 },
        { squadId: crypto.randomUUID(), lane: 5 },
      ],
    })
    const { repository } = setup()

    await expect(repository.listOutOfPlay(sessionId)).resolves.toEqual([3])
  })

  it('reads the average a director checked as the one in use, with its status (AVG-09, D-288)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const adjusted = await insertEntry(divisionId, sessionId, { last: 'Adams', average: 175 })
    const verified = await insertEntry(divisionId, sessionId, { last: 'Brown', average: 180 })
    await insertEntry(divisionId, sessionId, { last: 'Cole', average: 190 })
    await client.$executeRawUnsafe(
      `INSERT INTO AverageVerifications (RegistrationId, ProvidedAverage, VerifiedAverage, Note, VerifiedBy, VerifiedAt)
       VALUES (?, 175, 182, 'USBC book', 'user-1', NOW(3)), (?, 180, 180, NULL, 'user-1', NOW(3))`,
      adjusted,
      verified,
    )
    const { repository } = setup()

    const entries = await repository.listEntries(sessionId)

    const byName = (last: string) => entries.find((entry) => entry.lastName === last)
    expect(byName('Adams')).toMatchObject({
      average: 182,
      providedAverage: 175,
      averageStatus: 'adjusted',
      averageNote: 'USBC book',
    })
    expect(byName('Brown')).toMatchObject({ average: 180, averageStatus: 'verified' })
    expect(byName('Cole')).toMatchObject({ average: 190, averageStatus: 'unverified' })
  })

  it('reads an empty position as unassigned and a missing average as null (LAN-01, D-58)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    await insertEntry(divisionId, sessionId, { position: '', average: null })
    const { repository } = setup()

    const [entry] = await repository.listEntries(sessionId)

    expect(entry?.position).toBe('')
    expect(entry?.average).toBeNull()
  })

  it('reads only the entries of the session asked for (LAN-10)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const mine = await insertSession(tournamentId)
    const theirs = await insertSession(tournamentId)
    const registrationId = await insertEntry(divisionId, mine, { position: '1A' })
    await insertEntry(divisionId, theirs, { position: '3A' })
    const { repository } = setup()

    const entries = await repository.listEntries(mine)

    expect(entries.map((entry) => entry.registrationId)).toEqual([registrationId])
  })

  it('gives an empty list for a session nobody entered', async () => {
    const tournamentId = await insertTournament()
    const sessionId = await insertSession(tournamentId)

    await expect(setup().repository.listEntries(sessionId)).resolves.toEqual([])
  })

  it('never reads the SSN or other personal fields (BWL-17)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    await insertEntry(divisionId, sessionId)

    const [entry] = await setup().repository.listEntries(sessionId)

    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'average',
      'averageNote',
      'averageStatus',
      'bowlerId',
      'divisionId',
      'firstName',
      'lastName',
      'name',
      'position',
      'providedAverage',
      'registrationId',
      'suffix',
      'superSweeper',
    ])
    expect(JSON.stringify(entry)).not.toContain('c2VjcmV0LXNzbg==')
  })

  it('skips an entry that breaks the read shape and logs it once (D-51)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const good = await insertEntry(divisionId, sessionId, { first: 'Ann', position: '1A' })
    const bad = await insertEntry(divisionId, sessionId, { first: '' })
    const { repository, records } = setup()

    const first = await repository.listEntries(sessionId)
    await repository.listEntries(sessionId)

    expect(first.map((entry) => entry.registrationId)).toEqual([good])
    const warnings = records().filter(
      (record) => record['msg'] === 'Skipped a stored lane entry that breaks the read shape',
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ registrationId: bad, sessionId })
  })

  it('skips a lane entry whose registration row is gone and logs it (D-51)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const good = await insertEntry(divisionId, sessionId, { first: 'Ann', position: '1A' })
    const orphan = await insertEntry(divisionId, sessionId)
    // MyISAM has no foreign keys, so the legacy app could delete a registration and leave this row.
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
      await tx.$executeRawUnsafe('DELETE FROM Registrations WHERE Id = ?', orphan)
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
    })
    const { repository, records } = setup()

    const entries = await repository.listEntries(sessionId)

    expect(entries.map((entry) => entry.registrationId)).toEqual([good])
    expect(records()).toEqual([expect.objectContaining({ registrationId: orphan, sessionId })])
  })

  it('skips a lane entry whose bowler row is gone and logs it (D-51)', async () => {
    const tournamentId = await insertTournament()
    const divisionId = await insertDivision(tournamentId)
    const sessionId = await insertSession(tournamentId)
    const good = await insertEntry(divisionId, sessionId, { first: 'Ann', position: '1A' })
    const orphan = await insertEntry(divisionId, sessionId)
    // MyISAM has no foreign keys, so the legacy app could delete a bowler and leave the registration.
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
      await tx.$executeRawUnsafe(
        'DELETE FROM Bowlers WHERE Id = (SELECT BowlerId FROM Registrations WHERE Id = ?)',
        orphan,
      )
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
    })
    const { repository, records } = setup()

    const entries = await repository.listEntries(sessionId)

    expect(entries.map((entry) => entry.registrationId)).toEqual([good])
    expect(records()).toEqual([expect.objectContaining({ registrationId: orphan, sessionId })])
  })
})
