import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createPrismaDivisionRepository } from '../features/divisions/prismaRepository.ts'
import { createPrismaRegistrationRepository } from '../features/registrations/prismaRepository.ts'
import { summarize } from '../features/registrations/summary.ts'
import { createPrismaSquadRepository } from '../features/squads/prismaRepository.ts'
import { createPrismaSweeperRepository } from '../features/sweepers/prismaRepository.ts'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'
import { seedDivisions } from './seedDivisions.ts'
import { seedRegistrations } from './seedRegistrations.ts'
import { seedSessions } from './seedSessions.ts'
import { samples, seedTournaments } from './seedTournaments.ts'

describe('seedRegistrations', () => {
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
  })

  it('adds seven registrations to each sample tournament, in a shape the API reads (REG-23, REG-26)', async () => {
    await expect(seedRegistrations(client)).resolves.toBe(samples.length * 7)

    const { logger, records } = createCapturedLogger()
    const repository = createPrismaRegistrationRepository(client, logger)
    for (const { id } of samples) {
      const listed = await repository.listByTournament(id)
      expect(listed.map((r) => r.bowler.name)).toEqual([
        'Dana Abbott',
        'Ray Baptiste, Jr',
        'Maria Chen',
        'Tom Delgado',
        'Joe Fontaine',
        'Joe Fontaine',
        'Priya Nair',
      ])
      // One bowler has no USBC ID.
      expect(listed.filter((r) => r.bowler.usbcId === '')).toHaveLength(1)
    }
    // No warning: nobody in the sample data has two registrations (REG-27).
    expect(records()).toEqual([])
  })

  it('leaves one squad with no entries and a complete squad with some (REG-24)', async () => {
    await seedRegistrations(client)
    const { logger } = createCapturedLogger()
    const id = samples[0]?.id ?? ''

    const summary = summarize(
      await createPrismaRegistrationRepository(client, logger).listByTournament(id),
      await createPrismaDivisionRepository(client, logger).listByTournament(id),
      await createPrismaSquadRepository(client, logger).listByTournament(id),
      await createPrismaSweeperRepository(client, logger).listByTournament(id),
    )

    expect(summary.registrations).toBe(7)
    expect(summary.superSweepers).toBe(2)
    expect(summary.squads.map((squad) => squad.entries)).toEqual([5, 5, 0])
    expect(summary.sweepers.map((sweeper) => sweeper.entries)).toEqual([3, 3])
  })

  it('adds nothing the second time (REG-26)', async () => {
    await seedRegistrations(client)
    await seedRegistrations(client)

    const rows = await client.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM Registrations`
    expect(Number(rows[0]?.count)).toBe(samples.length * 7)
  })

  it('never writes an SSN (BWL-17)', async () => {
    await seedRegistrations(client)

    const rows = await client.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM Bowlers WHERE SocialSecurityNumber <> ''`
    expect(Number(rows[0]?.count)).toBe(0)
  })
})
