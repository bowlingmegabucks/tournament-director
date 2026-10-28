import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { createTournament } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaSweeperRepository } from './prismaRepository.ts'

describe('Prisma sweeper repository', () => {
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

  async function insertDivision(
    tournamentId: string,
    number: number,
    name: string,
  ): Promise<string> {
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

  /** A sweeper the way legacy writes it: the fee in `SweeperEntryFee`, the cash ratio in `CashRatio`. */
  async function insertSweeper(
    tournamentId: string,
    fields: {
      id?: string
      type?: number
      date?: string
      lane?: number
      complete?: number
      fee?: number | null
      games?: number | null
      cash?: number | null
    } = {},
  ): Promise<string> {
    const id = fields.id ?? crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Squads
         (Id, TournamentId, SquadType, Date, CashRatio, MaxPerPair, StartingLane, NumberOfLanes,
          Complete, FinalsRatio, SquadEntryFee, SweeperEntryFee, Games)
       VALUES (?, ?, ?, ?, ?, 4, ?, 12, ?, NULL, NULL, ?, ?)`,
      id,
      tournamentId,
      fields.type ?? 1,
      fields.date ?? '2026-10-24 18:00:00',
      fields.cash === undefined ? 4 : fields.cash,
      fields.lane ?? 1,
      fields.complete ?? 0,
      fields.fee === undefined ? 25 : fields.fee,
      fields.games === undefined ? 3 : fields.games,
    )
    return id
  }

  async function insertPins(sweeperId: string, divisionId: string, pins: number | null) {
    await client.$executeRawUnsafe(
      `INSERT INTO SweeperDivision (SweeperId, DivisionId, BonusPinsPerGame) VALUES (?, ?, ?)`,
      sweeperId,
      divisionId,
      pins,
    )
  }

  function setup() {
    const captured = createCapturedLogger()
    return { ...captured, repository: createPrismaSweeperRepository(client, captured.logger) }
  }

  it("reads a sweeper's own fee, games, and cash ratio (SQD-22, D-43)", async () => {
    const tournamentId = await insertTournament()
    const id = await insertSweeper(tournamentId, { fee: 27.5, games: 4, cash: 4.5, complete: 1 })
    const { repository } = setup()

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([
      {
        id,
        date: '2026-10-24T18:00:00',
        complete: true,
        startingLane: 1,
        numberOfLanes: 12,
        maxPerPair: 4,
        entryFee: 27.5,
        games: 4,
        cashRatio: 4.5,
        bonusPins: [],
      },
    ])
  })

  it('lists only divisions with pins other than 0, in division order (SQD-22, DIV-14, D-45)', async () => {
    const tournamentId = await insertTournament()
    const scratch = await insertDivision(tournamentId, 3, 'Scratch')
    const open = await insertDivision(tournamentId, 1, 'Open')
    const women = await insertDivision(tournamentId, 2, 'Women')
    const seniors = await insertDivision(tournamentId, 4, 'Seniors')
    await insertDivision(tournamentId, 5, 'Youth')
    const sweeper = await insertSweeper(tournamentId)
    await insertPins(sweeper, women, 6)
    await insertPins(sweeper, open, 10)
    await insertPins(sweeper, scratch, 0)
    await insertPins(sweeper, seniors, null)
    const { repository } = setup()

    const [listed] = await repository.listByTournament(tournamentId)

    expect(listed?.bonusPins).toEqual([
      { divisionId: open, divisionName: 'Open', bonusPinsPerGame: 10 },
      { divisionId: women, divisionName: 'Women', bonusPinsPerGame: 6 },
    ])
  })

  it("keeps each sweeper's pins apart and ignores another tournament's divisions (D-45)", async () => {
    const tournamentId = await insertTournament()
    const otherTournament = await insertTournament()
    const open = await insertDivision(tournamentId, 1, 'Open')
    const foreign = await insertDivision(otherTournament, 1, 'Foreign')
    const first = await insertSweeper(tournamentId, { lane: 1 })
    const second = await insertSweeper(tournamentId, { lane: 13 })
    await insertPins(first, open, 10)
    await insertPins(second, foreign, 99)
    const { repository } = setup()

    const listed = await repository.listByTournament(tournamentId)

    expect(listed.map((sweeper) => sweeper.id)).toEqual([first, second])
    expect(listed[0]?.bonusPins).toHaveLength(1)
    expect(listed[1]?.bonusPins).toEqual([])
  })

  it('lists only the sweepers of the tournament asked for, and no squads (SQD-22, D-42)', async () => {
    const mine = await insertTournament()
    const other = await insertTournament()
    const wanted = await insertSweeper(mine)
    await insertSweeper(mine, { type: 0 })
    await insertSweeper(mine, { type: 2 })
    await insertSweeper(other)
    const { repository } = setup()

    const sweepers = await repository.listByTournament(mine)

    expect(sweepers.map((sweeper) => sweeper.id)).toEqual([wanted])
  })

  it('lists nothing for a tournament with no sweepers (SQD-22)', async () => {
    const tournamentId = await insertTournament()
    const { repository } = setup()

    await expect(repository.listByTournament(tournamentId)).resolves.toEqual([])
  })

  it('sorts by date, then starting lane, then id (SQD-20, D-45)', async () => {
    const tournamentId = await insertTournament()
    const late = await insertSweeper(tournamentId, { date: '2026-10-25 09:00:00' })
    const high = await insertSweeper(tournamentId, { lane: 13 })
    const low = await insertSweeper(tournamentId, {
      lane: 1,
      id: 'f0000000-0000-4000-8000-000000000002',
    })
    const lower = await insertSweeper(tournamentId, {
      lane: 1,
      id: 'f0000000-0000-4000-8000-000000000001',
    })
    const { repository } = setup()

    const sweepers = await repository.listByTournament(tournamentId)

    expect(sweepers.map((sweeper) => sweeper.id)).toEqual([lower, low, high, late])
  })

  it('skips a sweeper with no fee, games, or cash ratio and logs its id (SQD-11, SQD-12, D-42)', async () => {
    const tournamentId = await insertTournament()
    const good = await insertSweeper(tournamentId)
    const noFee = await insertSweeper(tournamentId, { fee: null })
    const { repository, records } = setup()

    const sweepers = await repository.listByTournament(tournamentId)

    expect(sweepers.map((sweeper) => sweeper.id)).toEqual([good])
    expect(records()).toMatchObject([
      {
        level: 40,
        sweeperId: noFee,
        tournamentId,
        msg: 'Skipped a stored sweeper that breaks the read shape',
        problems: [expect.stringMatching(/^entryFee: /)],
      },
    ])
  })

  it('turns an unreachable database into a 503 (D-32)', async () => {
    const unreachable = createDatabaseClient('mariadb://u:p@127.0.0.1:1/legacy?acquireTimeout=300')
    const { logger } = createCapturedLogger()
    const repository = createPrismaSweeperRepository(unreachable, logger)

    try {
      await expect(repository.listByTournament(crypto.randomUUID())).rejects.toMatchObject({
        status: 503,
      })
    } finally {
      await unreachable.$disconnect()
    }
  })
})
