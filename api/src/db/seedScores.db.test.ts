import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createPrismaScoreRepository } from '../features/scores/prismaRepository.ts'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'
import { seedDivisions } from './seedDivisions.ts'
import { seedRegistrations } from './seedRegistrations.ts'
import { seedScores } from './seedScores.ts'
import { seedSessions, sessionId } from './seedSessions.ts'
import { samples, seedTournaments } from './seedTournaments.ts'

describe('seedScores', () => {
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
  })

  it('adds the same scores to each sample tournament, in a shape the API reads (SCR-16)', async () => {
    await expect(seedScores(client)).resolves.toBe(samples.length * 20)

    const { logger, records } = createCapturedLogger()
    const repository = createPrismaScoreRepository(client, logger)
    for (const { id } of samples) {
      const complete = await repository.listScores(sessionId(id, 'a', 1))
      const open = await repository.listScores(sessionId(id, 'a', 2))
      const sweeper = await repository.listScores(sessionId(id, 'b', 1))
      expect(complete).toHaveLength(15)
      expect(complete.filter((row) => row.score === 0)).toHaveLength(3)
      expect(open).toHaveLength(3)
      expect(sweeper).toHaveLength(2)
    }
    expect(records()).toEqual([])
  })

  it('is safe to run again (SCR-16)', async () => {
    await seedScores(client)
    await seedScores(client)

    expect(await client.squadScore.count()).toBe(samples.length * 20)
  })
})
