import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaDivisionRepository } from './prismaRepository.ts'

describe('Prisma division repository', () => {
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

  /** Insert a row the way legacy writes it: the percentage as a fraction, gender as 0 or 1. */
  async function insertDivision(
    tournamentId: string,
    fields: {
      id?: string
      name?: string
      number?: number
      gender?: number | null
      percentage?: number | null
      base?: number | null
      cap?: number | null
      minimumAge?: number | null
      maximumAverage?: number | null
    } = {},
  ): Promise<string> {
    const id = fields.id ?? crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Divisions
         (Id, Name, Number, TournamentId, MinimumAge, MaximumAge, MinimumAverage, MaximumAverage,
          HandicapPercentage, HandicapBase, MaximumHandicapPerGame, Gender)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
      id,
      fields.name ?? 'Open',
      fields.number ?? 1,
      tournamentId,
      fields.minimumAge ?? null,
      fields.maximumAverage ?? null,
      fields.percentage ?? null,
      fields.base ?? null,
      fields.cap ?? null,
      fields.gender ?? null,
    )
    return id
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, repository: createPrismaDivisionRepository(client, captured.logger) }
  }

  it('reads every column of a stored division (DIV-12)', async () => {
    const tournamentId = await insertTournament()
    const id = await insertDivision(tournamentId, {
      name: 'Women',
      number: 2,
      gender: 1,
      percentage: 0.9,
      base: 220,
      cap: 40,
      minimumAge: 18,
      maximumAverage: 199,
    })
    const { repository } = setup()

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([
      {
        id,
        name: 'Women',
        number: 2,
        gender: 'Female',
        minimumAge: 18,
        maximumAge: null,
        minimumAverage: null,
        maximumAverage: 199,
        handicapPercentage: 90,
        handicapBase: 220,
        maximumHandicapPerGame: 40,
      },
    ])
  })

  it('lists only the divisions of the tournament asked for (DIV-12)', async () => {
    const mine = await insertTournament()
    const other = await insertTournament()
    const wanted = await insertDivision(mine)
    await insertDivision(other)
    const { repository } = setup()

    const divisions = await repository.listByTournament(mine)

    expect(divisions.map((division) => division.id)).toEqual([wanted])
  })

  it('lists nothing for a tournament with no divisions (DIV-12)', async () => {
    const tournamentId = await insertTournament()
    const { repository } = setup()

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([])
  })

  it('sorts by number, then name (DIV-13, D-38)', async () => {
    const tournamentId = await insertTournament()
    await insertDivision(tournamentId, { number: 3, name: 'Scratch' })
    await insertDivision(tournamentId, { number: 1, name: 'Seniors' })
    await insertDivision(tournamentId, { number: 1, name: 'Open' })
    await insertDivision(tournamentId, { number: 10, name: 'Last' })
    const { repository } = setup()

    const divisions = await repository.listByTournament(tournamentId)

    expect(divisions.map((division) => division.name)).toEqual([
      'Open',
      'Seniors',
      'Scratch',
      'Last',
    ])
  })

  it('skips a row that breaks the read shape and logs its id (D-39)', async () => {
    const tournamentId = await insertTournament()
    const good = await insertDivision(tournamentId, { number: 1 })
    const bad = await insertDivision(tournamentId, { number: 2, name: 'Odd', gender: 2 })
    const { repository, records } = setup()

    const divisions = await repository.listByTournament(tournamentId)

    expect(divisions.map((division) => division.id)).toEqual([good])
    expect(records()).toMatchObject([
      {
        level: 40,
        divisionId: bad,
        tournamentId,
        msg: 'Skipped a stored division that breaks the read shape',
        problems: [expect.stringMatching(/^gender: /)],
      },
    ])
  })

  it('still lists a row that DIV-01 to DIV-11 would refuse on save (D-39)', async () => {
    const tournamentId = await insertTournament()
    const id = await insertDivision(tournamentId, { number: 0 })
    const { repository } = setup()

    const divisions = await repository.listByTournament(tournamentId)

    expect(divisions.map((division) => division.id)).toEqual([id])
  })

  it('turns an unreachable database into a 503 (D-32)', async () => {
    const unreachable = createDatabaseClient('mariadb://u:p@127.0.0.1:1/legacy?acquireTimeout=300')
    const { logger } = createCapturedLogger()
    const repository = createPrismaDivisionRepository(unreachable, logger)

    try {
      await expect(repository.listByTournament(crypto.randomUUID())).rejects.toMatchObject({
        status: 503,
      })
    } finally {
      await unreachable.$disconnect()
    }
  })
})
