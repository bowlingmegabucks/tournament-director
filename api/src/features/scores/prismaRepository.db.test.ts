import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaScoreRepository } from './prismaRepository.ts'

describe('Prisma score repository', () => {
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

  async function insertSession(): Promise<string> {
    const { id, name } = createTournament()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, ?, '2026-10-23', '2026-10-25', 50, 6, 7.0, 5.0, 'Lanes', 0)`,
      id,
      name,
    )
    const sessionId = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete)
       VALUES (?, ?, 0, '2026-10-24 09:00:00', 4, 1, 12, 0)`,
      sessionId,
      id,
    )
    return sessionId
  }

  async function insertBowler(): Promise<string> {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, 'Ray', 'Q', 'Baptiste', '', '1 Main St', 'Boston', 'MA', '02101', 'x@example.com',
               '6175550100', '1190-55820', '1980-01-01', 0, 'c2VjcmV0LXNzbg==')`,
      id,
    )
    return id
  }

  function insertScore(bowlerId: string, sessionId: string, game: number, score: number) {
    return client.$executeRawUnsafe(
      'INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, ?, ?)',
      bowlerId,
      sessionId,
      game,
      score,
    )
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, repository: createPrismaScoreRepository(client, captured.logger) }
  }

  it('reads the bowler, game, and score of each saved row (SCR-16)', async () => {
    const sessionId = await insertSession()
    const bowlerId = await insertBowler()
    await insertScore(bowlerId, sessionId, 1, 212)
    await insertScore(bowlerId, sessionId, 2, 0)

    const rows = await setup().repository.listScores(sessionId)

    expect(rows.toSorted((a, b) => a.game - b.game)).toEqual([
      { bowlerId, game: 1, score: 212 },
      { bowlerId, game: 2, score: 0 },
    ])
  })

  it('reads only the scores of the session asked for (SCR-16)', async () => {
    const mine = await insertSession()
    const theirs = await insertSession()
    const bowlerId = await insertBowler()
    await insertScore(bowlerId, mine, 1, 200)
    await insertScore(bowlerId, theirs, 1, 111)

    await expect(setup().repository.listScores(mine)).resolves.toEqual([
      { bowlerId, game: 1, score: 200 },
    ])
  })

  it('gives an empty list for a session with no scores', async () => {
    const sessionId = await insertSession()

    await expect(setup().repository.listScores(sessionId)).resolves.toEqual([])
  })

  it('reads only the three score columns, never a bowler field (BWL-17)', async () => {
    const sessionId = await insertSession()
    const bowlerId = await insertBowler()
    await insertScore(bowlerId, sessionId, 1, 200)

    const [row] = await setup().repository.listScores(sessionId)

    expect(Object.keys(row ?? {}).sort()).toEqual(['bowlerId', 'game', 'score'])
  })

  it('skips a row that breaks the read shape and logs it once (D-69)', async () => {
    const sessionId = await insertSession()
    const bowlerId = await insertBowler()
    await insertScore(bowlerId, sessionId, 1, 200)
    await insertScore(bowlerId, sessionId, 0, 150)
    const { repository, records } = setup()

    const first = await repository.listScores(sessionId)
    await repository.listScores(sessionId)

    expect(first).toEqual([{ bowlerId, game: 1, score: 200 }])
    const warnings = records().filter(
      (record) => record['msg'] === 'Skipped a stored score that breaks the read shape',
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ bowlerId, sessionId, game: 0 })
  })
})
