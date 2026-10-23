import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createPrismaSquadRepository } from '../features/squads/prismaRepository.ts'
import { createPrismaSweeperRepository } from '../features/sweepers/prismaRepository.ts'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'
import { seedDivisions } from './seedDivisions.ts'
import { seedSessions } from './seedSessions.ts'
import { samples, seedTournaments } from './seedTournaments.ts'

describe('seedSessions', () => {
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
  })

  it('adds three squads and two sweepers to each sample tournament, in a shape the API reads (SQD-21, SQD-22)', async () => {
    await expect(seedSessions(client)).resolves.toBe(20)

    const { logger, records } = createCapturedLogger()
    const squads = createPrismaSquadRepository(client, logger)
    const sweepers = createPrismaSweeperRepository(client, logger)
    for (const { id } of samples) {
      const listed = await squads.listByTournament(id)
      expect(listed.map(({ complete }) => complete)).toEqual([true, false, false])
      // The second squad overrides the fee and finals ratio; the first overrides nothing (TRN-12).
      expect(listed[0]).toMatchObject({ entryFeeOverridden: false, finalsRatioOverridden: false })
      expect(listed[1]).toMatchObject({
        entryFee: 60,
        entryFeeOverridden: true,
        finalsRatio: 8,
        finalsRatioOverridden: true,
      })

      const sweeperList = await sweepers.listByTournament(id)
      expect(sweeperList.map(({ games }) => games)).toEqual([3, 4])
      // Open +10 and Women +6; Scratch has no row (D-45).
      expect(
        sweeperList[0]?.bonusPins.map(({ divisionName, bonusPinsPerGame }) => [
          divisionName,
          bonusPinsPerGame,
        ]),
      ).toEqual([
        ['Open', 10],
        ['Women', 6],
      ])
      // NULL and 0 are stored but not shown (D-45).
      expect(sweeperList[1]?.bonusPins.map(({ divisionName }) => divisionName)).toEqual(['Women'])
    }
    expect(records()).toEqual([])
  })

  it('adds nothing new when it runs twice', async () => {
    await seedSessions(client)
    await seedSessions(client)

    expect(await client.squad.count()).toBe(20)
    expect(await client.sweeperDivision.count()).toBe(20)
  })
})
