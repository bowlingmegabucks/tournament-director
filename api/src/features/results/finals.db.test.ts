import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { seedDivisions } from '../../db/seedDivisions.ts'
import { seedRegistrations } from '../../db/seedRegistrations.ts'
import { seedScores } from '../../db/seedScores.ts'
import { seedSessions } from '../../db/seedSessions.ts'
import { samples, seedTournaments } from '../../db/seedTournaments.ts'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createPrismaDivisionRepository } from '../divisions/prismaRepository.ts'
import { createPrismaLaneRepository } from '../lanes/prismaRepository.ts'
import { createPrismaScoreRepository } from '../scores/prismaRepository.ts'
import { createPrismaSquadRepository } from '../squads/prismaRepository.ts'
import { createPrismaSweeperRepository } from '../sweepers/prismaRepository.ts'
import { createPrismaTournamentRepository } from '../tournaments/prismaRepository.ts'
import { atLargeResultsSchema, seedingResultsSchema, superSweeperResultsSchema } from './types.ts'

// The finals results read every squad and sweeper of a tournament. This test proves the pieces fit
// on a real database, using the sample data: squad 1 complete, squads 2 and 3 open, sweeper 2
// complete and sweeper 1 open (D-88, D-90).
describe('finals results on a real database', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
    await seedTournaments(client)
    await seedDivisions(client)
    await seedSessions(client)
    await seedRegistrations(client)
    await seedScores(client)
  })

  const tournamentId = samples[0]?.id ?? ''

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

  it('serves at-large results that are unofficial while a squad is open (RES-12, D-88)', async () => {
    const response = await request(appOnDatabase()).get(`/v1/tournaments/${tournamentId}/at-large`)

    expect(response.status).toBe(200)
    expect(atLargeResultsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body).toMatchObject({ complete: false, finalsRatio: 7 })
  })

  it('serves a seeding with the finalists first (RES-20)', async () => {
    const response = await request(appOnDatabase()).get(`/v1/tournaments/${tournamentId}/seeding`)

    expect(response.status).toBe(200)
    expect(seedingResultsSchema.safeParse(response.body).success).toBe(true)
    const rows = response.body.divisions.flatMap((division: { rows: unknown[] }) => division.rows)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('serves the super sweeper with a bowler who finished, one who did not, and one who missed (D-90)', async () => {
    const response = await request(appOnDatabase()).get(
      `/v1/tournaments/${tournamentId}/super-sweeper`,
    )

    expect(response.status).toBe(200)
    expect(superSweeperResultsSchema.safeParse(response.body).success).toBe(true)
    expect(response.body.complete).toBe(false)
    expect(
      response.body.sweepers.map((sweeper: { complete: boolean }) => sweeper.complete),
    ).toEqual([false, true])
    const byName = Object.fromEntries(
      response.body.rows.map((row: { name: string }) => [row.name, row]),
    )
    expect(byName['Dana Abbott'].flags).toEqual([])
    expect(byName['Maria Chen'].flags).toMatchObject([{ kind: 'unfinished', gamesBowled: 2 }])
    expect(byName['Tom Delgado'].flags).toMatchObject([{ kind: 'missed', gamesBowled: 0 }])
    // Open sweeper 1: Dana has two games in, the others none yet.
    expect(byName['Dana Abbott'].sweeperTotals[0]).toBeGreaterThan(0)
    expect(byName['Maria Chen'].sweeperTotals[0]).toBeNull()
  })

  it('answers 422 for the legacy super sweeper cash ratio of 0 (D-17)', async () => {
    await client.$executeRawUnsafe(
      'UPDATE Tournaments SET SuperSweperCashRatio = 0 WHERE Id = ?',
      tournamentId,
    )

    const response = await request(appOnDatabase()).get(
      `/v1/tournaments/${tournamentId}/super-sweeper`,
    )

    expect(response.status).toBe(422)
  })
})
