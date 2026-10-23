import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createPrismaDivisionRepository } from '../features/divisions/prismaRepository.ts'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'
import { seedDivisions } from './seedDivisions.ts'
import { samples, seedTournaments } from './seedTournaments.ts'

describe('seedDivisions', () => {
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
  })

  it('adds Open, Women, and Scratch to each sample tournament, in a shape the API reads (DIV-12)', async () => {
    await expect(seedDivisions(client)).resolves.toBe(12)

    const { logger, records } = createCapturedLogger()
    const repository = createPrismaDivisionRepository(client, logger)
    for (const { id } of samples) {
      const divisions = await repository.listByTournament(id)
      expect(divisions.map(({ number, name }) => [number, name])).toEqual([
        [1, 'Open'],
        [2, 'Women'],
        [3, 'Scratch'],
      ])
      expect(divisions[1]).toMatchObject({
        gender: 'Female',
        handicapPercentage: 90,
        handicapBase: 220,
        maximumHandicapPerGame: 40,
      })
      expect(divisions[2]).toMatchObject({ handicapPercentage: null, handicapBase: null })
    }
    expect(records()).toEqual([])
  })

  it('adds nothing new when it runs twice', async () => {
    await seedDivisions(client)
    await seedDivisions(client)

    expect(await client.division.count()).toBe(12)
  })
})
