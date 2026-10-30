import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createPrismaDivisionRepository } from '../divisions/prismaRepository.ts'
import { createPrismaLaneRepository } from '../lanes/prismaRepository.ts'
import { createPrismaScoreRepository } from '../scores/prismaRepository.ts'
import { createPrismaSquadRepository } from '../squads/prismaRepository.ts'
import { createPrismaSweeperRepository } from '../sweepers/prismaRepository.ts'
import { createPrismaTournamentRepository } from '../tournaments/prismaRepository.ts'
import { squadResultsSchema, sweeperResultsSchema } from './types.ts'

// The results read the tables that the other features read. This test proves the pieces fit on a
// real database: the squads in date order, the scores, and a bowler who advanced in an earlier
// squad (RES-06, D-81).
describe('results on a real database', () => {
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
       VALUES (?, ?, '2026-10-23', '2026-10-25', 50, 3, 7.0, 5.0, 'Lanes', 0)`,
      id,
      name,
    )
    return id
  }

  async function insertDivision(tournamentId: string, name: string, number: number) {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions (Id, Name, Number, TournamentId) VALUES (?, ?, ?, ?)`,
      id,
      name,
      number,
      tournamentId,
    )
    return id
  }

  /** A squad that overrides the ratios, so four bowlers give 1 advancer and 1 casher. */
  async function insertSquad(tournamentId: string, hour: number) {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete,
          FinalsRatio, CashRatio)
       VALUES (?, ?, 0, ?, 4, 1, 12, 0, 4.0, 2.0)`,
      id,
      tournamentId,
      `2026-10-24 ${String(hour).padStart(2, '0')}:00:00`,
    )
    return id
  }

  async function insertSweeper(tournamentId: string) {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, MaxPerPair, StartingLane, NumberOfLanes, Complete,
          SweeperEntryFee, Games, CashRatio)
       VALUES (?, ?, 1, '2026-10-24 18:00:00', 4, 1, 12, 0, 25, 3, 2.0)`,
      id,
      tournamentId,
    )
    return id
  }

  async function insertBowler(divisionId: string, lastName: string, average: number) {
    const bowlerId = crypto.randomUUID()
    const registrationId = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Bowlers
         (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
          ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
       VALUES (?, 'Pat', 'Q', ?, '', '1 Main St', 'Boston', 'MA', '02101', 'x@example.com',
               '6175550100', '1190-55820', '1980-01-01', 0, 'c2VjcmV0LXNzbg==')`,
      bowlerId,
      lastName,
    )
    await client.$executeRawUnsafe(
      `INSERT INTO Registrations (Id, BowlerId, DivisionId, Average, SuperSweeper)
       VALUES (?, ?, ?, ?, 0)`,
      registrationId,
      bowlerId,
      divisionId,
      average,
    )
    return { bowlerId, registrationId }
  }

  async function enter(registrationId: string, sessionId: string) {
    await client.$executeRawUnsafe(
      `INSERT INTO SquadRegistration (RegistrationId, SquadId, LaneAssignment) VALUES (?, ?, '')`,
      registrationId,
      sessionId,
    )
  }

  async function score(bowlerId: string, sessionId: string, games: number[]) {
    for (const [index, pins] of games.entries()) {
      await client.$executeRawUnsafe(
        'INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, ?, ?)',
        bowlerId,
        sessionId,
        index + 1,
        pins,
      )
    }
  }

  function appOnDatabase() {
    const { logger } = createCapturedLogger()
    return createTestApp({
      logger,
      tournaments: createPrismaTournamentRepository(client, logger),
      divisions: createPrismaDivisionRepository(client, logger),
      squads: createPrismaSquadRepository(client, logger),
      sweepers: createPrismaSweeperRepository(client, logger),
      lanes: createPrismaLaneRepository(client, logger),
      scores: createPrismaScoreRepository(client, logger),
    })
  }

  async function twoSquads() {
    const tournamentId = await insertTournament()
    const open = await insertDivision(tournamentId, 'Open', 1)
    const morning = await insertSquad(tournamentId, 9)
    const afternoon = await insertSquad(tournamentId, 13)
    const people = [
      { name: 'Adams', games: [250, 250, 250] },
      { name: 'Baker', games: [200, 200, 200] },
      { name: 'Clark', games: [190, 190, 190] },
      { name: 'Davis', games: [180, 180, 180] },
    ]
    const bowlers = []
    for (const person of people) {
      const { bowlerId, registrationId } = await insertBowler(open, person.name, 150)
      for (const squadId of [morning, afternoon]) {
        await enter(registrationId, squadId)
        await score(bowlerId, squadId, person.games)
      }
      bowlers.push({ ...person, registrationId })
    }
    return { tournamentId, morning, afternoon, bowlers }
  }

  it('lets the top bowler advance in the morning squad (RES-04, RES-07)', async () => {
    const { tournamentId, morning, bowlers } = await twoSquads()

    const response = await request(appOnDatabase()).get(
      `/v1/tournaments/${tournamentId}/squads/${morning}/results`,
    )

    expect(response.status).toBe(200)
    expect(squadResultsSchema.safeParse(response.body).success).toBe(true)
    const rows = response.body.divisions[0].rows
    expect(rows[0]).toMatchObject({
      registrationId: bowlers[0]?.registrationId,
      place: 1,
      group: 'advancer',
      advancedEarlier: false,
      total: 750,
      handicap: 0,
    })
  })

  it('treats the morning advancer as an earlier advancer in the afternoon squad (RES-06, D-81)', async () => {
    const { tournamentId, afternoon, bowlers } = await twoSquads()

    const response = await request(appOnDatabase()).get(
      `/v1/tournaments/${tournamentId}/squads/${afternoon}/results`,
    )

    const rows = response.body.divisions[0].rows
    expect(rows[0]).toMatchObject({
      registrationId: bowlers[1]?.registrationId,
      place: 1,
      group: 'advancer',
    })
    expect(rows[1]).toMatchObject({
      registrationId: bowlers[0]?.registrationId,
      place: 2,
      group: 'casher',
      advancedEarlier: true,
    })
  })

  it('serves the sweeper results with the division bonus pins (RES-22, SCR-09)', async () => {
    const tournamentId = await insertTournament()
    const open = await insertDivision(tournamentId, 'Open', 1)
    const seniors = await insertDivision(tournamentId, 'Women/Senior', 2)
    const sweeperId = await insertSweeper(tournamentId)
    await client.$executeRawUnsafe(
      `INSERT INTO SweeperDivision (SweeperId, DivisionId, BonusPinsPerGame) VALUES (?, ?, 10)`,
      sweeperId,
      seniors,
    )
    const plain = await insertBowler(open, 'Adams', 200)
    const senior = await insertBowler(seniors, 'Baker', 170)
    for (const { bowlerId, registrationId } of [plain, senior]) {
      await enter(registrationId, sweeperId)
      await score(bowlerId, sweeperId, [200, 200, 200])
    }

    const response = await request(appOnDatabase()).get(
      `/v1/tournaments/${tournamentId}/sweepers/${sweeperId}/results`,
    )

    expect(response.status).toBe(200)
    expect(sweeperResultsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.rows.map((row: { total: number }) => row.total)).toEqual([630, 600])
    expect(response.body.rows[0]).toMatchObject({ divisionName: 'Women/Senior', bonusPins: 10 })
    expect(response.body).toMatchObject({ entries: 2, cashers: 1, cutScore: 630 })
  })

  it('answers 404 for a squad of another tournament', async () => {
    const { morning } = await twoSquads()
    const otherTournament = await insertTournament()

    const response = await request(appOnDatabase()).get(
      `/v1/tournaments/${otherTournament}/squads/${morning}/results`,
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Squad not found' })
  })
})
