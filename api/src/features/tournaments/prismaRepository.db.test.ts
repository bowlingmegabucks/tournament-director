import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { HttpError } from '../../shared/errors.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaTournamentRepository } from './prismaRepository.ts'
import type { Tournament } from './types.ts'

describe('Prisma tournament repository', () => {
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

  /** Insert a row the way legacy writes it: dates at midnight, the fee as a decimal. */
  async function insert(tournament: Tournament): Promise<void> {
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, ?, ?, ?, ?, 6, 7.0, 5.0, ?, 0)`,
      tournament.id,
      tournament.name,
      `${tournament.startDate} 00:00:00`,
      `${tournament.endDate} 00:00:00`,
      tournament.entryFee,
      tournament.bowlingCenter,
    )
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, repository: createPrismaTournamentRepository(client, captured.logger) }
  }

  it('lists every stored tournament in the vendor shape, with no filter (TRN-11)', async () => {
    const past = createTournament({
      startDate: '2024-03-01',
      endDate: '2024-03-03',
      entryFee: 47.5,
    })
    const upcoming = createTournament({ startDate: '2026-12-31', endDate: '2027-01-02' })
    await insert(past)
    await insert(upcoming)
    const { repository } = setup()

    const tournaments = await repository.list()

    expect(tournaments).toHaveLength(2)
    expect(tournaments).toContainEqual(past)
    expect(tournaments).toContainEqual(upcoming)
  })

  it('lists nothing for an empty table (TRN-11)', async () => {
    const { repository } = setup()

    await expect(repository.list()).resolves.toEqual([])
  })

  it('skips a row that breaks the vendor shape and logs its id (D-31)', async () => {
    const good = createTournament()
    const bad = createTournament({ name: 'Old', entryFee: 0 })
    await insert(good)
    await insert(bad)
    const { repository, records } = setup()

    await expect(repository.list()).resolves.toEqual([good])

    expect(records()).toMatchObject([
      {
        level: 40,
        tournamentId: bad.id,
        problems: ['entryFee: Too small: expected number to be >0'],
      },
    ])
  })

  it('gets one tournament by id (TRN-15)', async () => {
    const wanted = createTournament()
    await insert(wanted)
    await insert(createTournament())
    const { repository } = setup()

    await expect(repository.get(wanted.id)).resolves.toEqual(wanted)
  })

  it('gets undefined for an unknown id (TRN-15)', async () => {
    const { repository } = setup()

    await expect(repository.get(createTournament().id)).resolves.toBeUndefined()
  })

  it('throws for a stored row that breaks the vendor shape (D-31)', async () => {
    const bad = createTournament({ bowlingCenter: '' })
    await insert(bad)
    const { repository } = setup()

    await expect(repository.get(bad.id)).rejects.toThrow(
      `Stored tournament ${bad.id} breaks the vendor shape: bowlingCenter:`,
    )
  })

  it('turns an unreachable database into a 503 (D-32)', async () => {
    const unreachable = createDatabaseClient('mariadb://u:p@127.0.0.1:1/legacy?acquireTimeout=300')
    const { logger } = createCapturedLogger()
    const repository = createPrismaTournamentRepository(unreachable, logger)

    try {
      await expect(repository.list()).rejects.toMatchObject({ status: 503 })
      await expect(repository.get(createTournament().id)).rejects.toBeInstanceOf(HttpError)
    } finally {
      await unreachable.$disconnect()
    }
  })
})
