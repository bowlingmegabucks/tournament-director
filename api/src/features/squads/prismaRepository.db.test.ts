import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaSquadRepository } from './prismaRepository.ts'

describe('Prisma squad repository', () => {
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

  /** A tournament with a $50 fee, 6 games, finals ratio 7.0, and cash ratio 5.0. */
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

  /** Insert a row the way legacy writes it: the override columns NULL unless the squad sets them. */
  async function insertSquad(
    tournamentId: string,
    fields: {
      id?: string
      type?: number
      date?: string
      lane?: number
      lanes?: number
      perPair?: number
      complete?: number
      fee?: number | null
      finals?: number | null
      cash?: number | null
      sweeperFee?: number | null
    } = {},
  ): Promise<string> {
    const id = fields.id ?? crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, CashRatio, MaxPerPair, StartingLane, NumberOfLanes,
          Complete, FinalsRatio, SquadEntryFee, SweeperEntryFee, Games)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      id,
      tournamentId,
      fields.type ?? 0,
      fields.date ?? '2026-10-24 09:00:00',
      fields.cash ?? null,
      fields.perPair ?? 4,
      fields.lane ?? 1,
      fields.lanes ?? 24,
      fields.complete ?? 0,
      fields.finals ?? null,
      fields.fee ?? null,
      fields.sweeperFee ?? null,
    )
    return id
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, repository: createPrismaSquadRepository(client, captured.logger) }
  }

  it('reads a squad that sets nothing, using the tournament values (SQD-21, TRN-12)', async () => {
    const tournamentId = await insertTournament()
    const id = await insertSquad(tournamentId, { complete: 1 })
    const { repository } = setup()

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([
      {
        id,
        date: '2026-10-24T09:00:00',
        complete: true,
        startingLane: 1,
        numberOfLanes: 24,
        maxPerPair: 4,
        entryFee: 50,
        entryFeeOverridden: false,
        finalsRatio: 7,
        finalsRatioOverridden: false,
        cashRatio: 5,
        cashRatioOverridden: false,
        games: 6,
      },
    ])
  })

  it('reads the squad values, with decimals intact, when the squad overrides (TRN-12, D-43)', async () => {
    const tournamentId = await insertTournament()
    await insertSquad(tournamentId, { fee: 47.5, finals: 8.5, cash: 4.5 })
    const { repository } = setup()

    const [squad] = await repository.listByTournament(tournamentId)

    expect(squad).toMatchObject({
      entryFee: 47.5,
      entryFeeOverridden: true,
      finalsRatio: 8.5,
      finalsRatioOverridden: true,
      cashRatio: 4.5,
      cashRatioOverridden: true,
    })
  })

  it('lists only the squads of the tournament asked for, and no sweepers (SQD-21, D-42)', async () => {
    const mine = await insertTournament()
    const other = await insertTournament()
    const wanted = await insertSquad(mine)
    await insertSquad(mine, { type: 1, sweeperFee: 25 })
    await insertSquad(mine, { type: 2 })
    await insertSquad(other)
    const { repository } = setup()

    const squads = await repository.listByTournament(mine)

    expect(squads.map((squad) => squad.id)).toEqual([wanted])
  })

  it('lists nothing for a tournament with no squads, or one that does not exist (SQD-21)', async () => {
    const tournamentId = await insertTournament()
    const { repository } = setup()

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([])
    await expect(repository.listByTournament(crypto.randomUUID())).resolves.toEqual([])
  })

  it('sorts by date, then starting lane, then id (SQD-20, D-45)', async () => {
    const tournamentId = await insertTournament()
    const late = await insertSquad(tournamentId, { date: '2026-10-25 09:00:00' })
    const high = await insertSquad(tournamentId, { lane: 13 })
    const low = await insertSquad(tournamentId, {
      lane: 1,
      id: 'f0000000-0000-4000-8000-000000000002',
    })
    const lower = await insertSquad(tournamentId, {
      lane: 1,
      id: 'f0000000-0000-4000-8000-000000000001',
    })
    const { repository } = setup()

    const squads = await repository.listByTournament(tournamentId)

    expect(squads.map((squad) => squad.id)).toEqual([lower, low, high, late])
  })

  it('skips a row that breaks the read shape and logs its id (D-42)', async () => {
    const tournamentId = await insertTournament()
    const good = await insertSquad(tournamentId)
    const bad = await insertSquad(tournamentId, { id: 'not-a-uuid' })
    const { repository, records } = setup()

    const squads = await repository.listByTournament(tournamentId)

    expect(squads.map((squad) => squad.id)).toEqual([good])
    expect(records()).toMatchObject([
      {
        level: 40,
        squadId: bad,
        tournamentId,
        msg: 'Skipped a stored squad that breaks the read shape',
        problems: [expect.stringMatching(/^id: /)],
      },
    ])
  })

  it('still lists a row that SQD-01 to SQD-08 would refuse on save (D-42)', async () => {
    const tournamentId = await insertTournament()
    const id = await insertSquad(tournamentId, { lanes: 3, perPair: 0 })
    const { repository } = setup()

    const squads = await repository.listByTournament(tournamentId)

    expect(squads.map((squad) => squad.id)).toEqual([id])
  })

  it('turns an unreachable database into a 503 (D-32)', async () => {
    const unreachable = createDatabaseClient('mariadb://u:p@127.0.0.1:1/legacy?acquireTimeout=300')
    const { logger } = createCapturedLogger()
    const repository = createPrismaSquadRepository(unreachable, logger)

    try {
      await expect(repository.listByTournament(crypto.randomUUID())).rejects.toMatchObject({
        status: 503,
      })
    } finally {
      await unreachable.$disconnect()
    }
  })
})
