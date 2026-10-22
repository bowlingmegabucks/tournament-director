import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createPrismaTournamentRepository } from '../features/tournaments/prismaRepository.ts'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'
import { seedTournaments } from './seedTournaments.ts'

describe('seedTournaments', () => {
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

  const now = new Date('2026-10-22T15:30:00.000Z')

  it('adds one upcoming and three past tournaments the API can read', async () => {
    await expect(seedTournaments(client, now)).resolves.toBe(4)

    const repository = createPrismaTournamentRepository(client, createCapturedLogger().logger)
    const tournaments = await repository.list()
    expect(tournaments.map((tournament) => tournament.startDate).sort()).toEqual([
      '2023-10-25',
      '2024-10-24',
      '2025-10-24',
      '2026-10-24',
    ])
    expect(tournaments.every((tournament) => tournament.endDate > tournament.startDate)).toBe(true)
  })

  it('adds nothing new when it runs twice', async () => {
    await seedTournaments(client, now)
    await seedTournaments(client, now)

    expect(await client.tournament.count()).toBe(4)
  })
})
