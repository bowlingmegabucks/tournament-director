import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaTournamentWriter } from './prismaWriter.ts'

/**
 * The client, except that the first `times` calls of `tournament.update` inside a transaction fail
 * with `error`. The tournament flag is the last write of a complete, so a failure there comes after
 * every session was written: it shows whether they all rolled back (D-258).
 */
function failingTournamentFlag(real: PrismaClient, error: () => Error, times: number) {
  let left = times
  const bind = (target: object, member: unknown) =>
    typeof member === 'function' ? (member as (...args: unknown[]) => unknown).bind(target) : member
  const guarded = (tx: object) =>
    new Proxy(tx, {
      get(target, property) {
        const member: unknown = Reflect.get(target, property, target)
        if (property !== 'tournament' || typeof member !== 'object' || member === null) {
          return bind(target, member)
        }
        return new Proxy(member, {
          get(delegate, method) {
            const call: unknown = Reflect.get(delegate, method, delegate)
            if (method !== 'update') return bind(delegate, call)
            return (...args: unknown[]) => {
              if (left > 0) {
                left -= 1
                return Promise.reject(error())
              }
              return (call as (...inner: unknown[]) => Promise<unknown>).apply(delegate, args)
            }
          },
        })
      },
    })
  return new Proxy(real, {
    get(target, property) {
      const member: unknown = Reflect.get(target, property, target)
      if (property !== '$transaction') return bind(target, member)
      return (run: (tx: object) => Promise<unknown>, options: unknown) =>
        (target.$transaction as (...args: unknown[]) => Promise<unknown>).call(
          target,
          (tx: object) => run(guarded(tx)),
          options,
        )
    },
  })
}

const conflict = () => Object.assign(new Error('write conflict'), { code: 'P2034' })

describe('Prisma complete tournament (TRN-10, TRN-38 to TRN-41, D-256 to D-259)', () => {
  let client: PrismaClient
  let rows: LegacyRows
  // Divisions are unique by number in a tournament, and the column is small.
  let divisionNumber = 0

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
    rows = legacyRows(client)
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
    divisionNumber = 0
  })

  const writer = (database: PrismaClient = client) =>
    createPrismaTournamentWriter(database, createCapturedLogger().logger)

  const countOf = async (sql: string, ...values: unknown[]) => {
    const [row] = await client.$queryRawUnsafe<{ n: bigint }[]>(sql, ...values)
    return Number(row?.n ?? -1)
  }
  const tournamentComplete = async (id: string) =>
    (await countOf('SELECT COUNT(*) AS n FROM Tournaments WHERE Id = ? AND Completed = 1', id)) ===
    1
  const sessionComplete = async (id: string) =>
    (await countOf('SELECT COUNT(*) AS n FROM Squads WHERE Id = ? AND `Complete` = 1', id)) === 1
  const zerosOf = (tournamentId: string) =>
    countOf(
      `SELECT COUNT(*) AS n FROM SquadScores s JOIN Squads q ON q.Id = s.SquadId
        WHERE q.TournamentId = ? AND s.Score = 0`,
      tournamentId,
    )
  const scoreCount = (tournamentId: string) =>
    countOf(
      `SELECT COUNT(*) AS n FROM SquadScores s JOIN Squads q ON q.Id = s.SquadId
        WHERE q.TournamentId = ?`,
      tournamentId,
    )

  /** A sweeper the list can read. */
  async function sweeper(tournamentId: string, at = '2026-10-24 12:00:00') {
    const id = await rows.session(tournamentId, 'sweeper', at)
    await client.$executeRawUnsafe(
      'UPDATE Squads SET SweeperEntryFee = 20, Games = 3, CashRatio = 4.5 WHERE Id = ?',
      id,
    )
    return id
  }

  /** Enter `count` new bowlers in a squad. The first `scored` of them have all 6 games. */
  async function enter(tournamentId: string, squadId: string, count: number, scored = 0) {
    const division = await rows.division(tournamentId, {
      name: `Division ${crypto.randomUUID().slice(0, 4)}`,
      number: (divisionNumber += 1),
    })
    const bowlers: string[] = []
    for (let n = 0; n < count; n += 1) {
      const made = await rows.registration(division)
      await rows.squadEntry(made.registrationId, squadId)
      bowlers.push(made.bowlerId)
    }
    for (const bowlerId of bowlers.slice(0, scored)) {
      for (const game of [1, 2, 3, 4, 5, 6]) await rows.score(bowlerId, squadId, game)
    }
    return bowlers
  }

  it('closes every open squad and sweeper, zeroes the no-shows, and sets the flag (TRN-10, TRN-38, TRN-40, D-130, D-190)', async () => {
    const tournamentId = await rows.tournament()
    const first = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const second = await rows.session(tournamentId, 'squad', '2026-10-24 15:00:00')
    const sweep = await sweeper(tournamentId)
    // Two bowlers in the first squad, one scored and one a no-show; the second holds one no-show.
    const [scored, noShow] = await enter(tournamentId, first, 2, 1)
    await enter(tournamentId, second, 1)

    const outcome = await writer().complete(tournamentId)

    expect(outcome).toMatchObject({
      completed: { squadsCompleted: 2, sweepersCompleted: 1, noShowCount: 2 },
    })
    expect(
      'completed' in outcome &&
        outcome.completed.closed.map(({ kind, id }) => `${kind}:${id}`).sort(),
    ).toEqual([`squad:${first}`, `squad:${second}`, `sweeper:${sweep}`].sort())
    expect(await tournamentComplete(tournamentId)).toBe(true)
    for (const id of [first, second, sweep]) expect(await sessionComplete(id)).toBe(true)
    // Games 1 to 6 at 0 for each of the two no-shows; the scored bowler keeps real rows only.
    expect(await zerosOf(tournamentId)).toBe(12)
    expect(await countOf('SELECT COUNT(*) AS n FROM SquadScores WHERE BowlerId = ?', scored)).toBe(
      6,
    )
    expect(await countOf('SELECT COUNT(*) AS n FROM SquadScores WHERE BowlerId = ?', noShow)).toBe(
      6,
    )
  })

  it('leaves a bowler with some games as entered (SQD-15, D-75)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const [partial] = await enter(tournamentId, id, 1)
    await rows.score(partial ?? '', id, 1)

    await writer().complete(tournamentId)

    expect(await scoreCount(tournamentId)).toBe(1)
  })

  it('skips a session that is already complete and counts only what it closed (TRN-38, D-256)', async () => {
    const tournamentId = await rows.tournament()
    const closed = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const open = await rows.session(tournamentId, 'squad', '2026-10-24 15:00:00')
    await enter(tournamentId, closed, 1)
    await client.$executeRawUnsafe('UPDATE Squads SET `Complete` = 1 WHERE Id = ?', closed)
    await enter(tournamentId, open, 1)

    const outcome = await writer().complete(tournamentId)

    expect(outcome).toMatchObject({
      completed: { squadsCompleted: 1, sweepersCompleted: 0, noShowCount: 1 },
    })
    // The session closed earlier gets no zeros now, though its bowler has no score (D-192).
    expect(await zerosOf(tournamentId)).toBe(6)
    expect(await tournamentComplete(tournamentId)).toBe(true)
  })

  it('sets the flag alone when every session is complete already (TRN-39, D-257)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await client.$executeRawUnsafe('UPDATE Squads SET `Complete` = 1 WHERE Id = ?', id)

    const outcome = await writer().complete(tournamentId)

    expect(outcome).toMatchObject({
      completed: { squadsCompleted: 0, sweepersCompleted: 0, noShowCount: 0, closed: [] },
    })
    expect(await tournamentComplete(tournamentId)).toBe(true)
  })

  it('refuses a tournament that is already complete and saves nothing (TRN-39, D-257)', async () => {
    const tournamentId = await rows.tournament({ completed: true })
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await enter(tournamentId, id, 1)

    const outcome = await writer().complete(tournamentId)

    expect(outcome).toEqual({ refused: { tournament: 'This tournament is already complete' } })
    expect(await sessionComplete(id)).toBe(false)
    expect(await scoreCount(tournamentId)).toBe(0)
  })

  it('refuses a tournament with no squad, sweepers alone not counting (TRN-39, D-257)', async () => {
    const empty = await rows.tournament()
    const sweepOnly = await rows.tournament()
    const sweep = await sweeper(sweepOnly)

    expect(await writer().complete(empty)).toEqual({
      refused: { tournament: 'Add a squad before you complete this tournament' },
    })
    expect(await writer().complete(sweepOnly)).toEqual({
      refused: { tournament: 'Add a squad before you complete this tournament' },
    })
    expect(await tournamentComplete(empty)).toBe(false)
    expect(await sessionComplete(sweep)).toBe(false)
  })

  it("does not touch another tournament's sessions (TRN-38)", async () => {
    const tournamentId = await rows.tournament()
    const other = await rows.tournament()
    await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const kept = await rows.session(other, 'squad', '2026-10-24 09:00:00')
    await enter(other, kept, 1)

    await writer().complete(tournamentId)

    expect(await sessionComplete(kept)).toBe(false)
    expect(await tournamentComplete(other)).toBe(false)
    expect(await scoreCount(other)).toBe(0)
  })

  it('answers notFound for an unknown tournament (TRN-38)', async () => {
    expect(await writer().complete(crypto.randomUUID())).toEqual({ notFound: true })
    expect(await writer().getCompleteInfo(crypto.randomUUID())).toEqual({ notFound: true })
  })

  it('refuses a session the lists cannot read and writes nothing, not even for the readable ones (TRN-39, D-257)', async () => {
    const tournamentId = await rows.tournament()
    const readable = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await enter(tournamentId, readable, 1)
    // A sweeper with no fee, games, or ratio breaks the read shape.
    const broken = await rows.session(tournamentId, 'sweeper', '2026-10-24 12:00:00')

    const outcome = await writer().complete(tournamentId)

    expect(outcome).toEqual({
      refused: {
        session:
          'A sweeper holds values the app cannot read, so the tournament cannot be completed here.',
      },
    })
    expect(await sessionComplete(readable)).toBe(false)
    expect(await sessionComplete(broken)).toBe(false)
    expect(await scoreCount(tournamentId)).toBe(0)
    expect(await tournamentComplete(tournamentId)).toBe(false)
  })

  it('rolls every session and the zeros back when the tournament flag cannot be saved (TRN-40, D-258)', async () => {
    const tournamentId = await rows.tournament()
    const first = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const sweep = await sweeper(tournamentId)
    await enter(tournamentId, first, 1)
    const failing = failingTournamentFlag(client, () => new Error('disk full'), 1)

    await expect(writer(failing).complete(tournamentId)).rejects.toBeDefined()

    expect(await sessionComplete(first)).toBe(false)
    expect(await sessionComplete(sweep)).toBe(false)
    expect(await scoreCount(tournamentId)).toBe(0)
    expect(await tournamentComplete(tournamentId)).toBe(false)
  })

  it('retries a lost serializable race and completes once (TRN-40, D-258)', async () => {
    const tournamentId = await rows.tournament()
    const id = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    await enter(tournamentId, id, 1)
    const racing = failingTournamentFlag(client, conflict, 1)

    const outcome = await writer(racing).complete(tournamentId)

    expect(outcome).toMatchObject({ completed: { squadsCompleted: 1, noShowCount: 1 } })
    // The failed first try rolled back, so the no-show has 6 zeros and not 12.
    expect(await zerosOf(tournamentId)).toBe(6)
    expect(await tournamentComplete(tournamentId)).toBe(true)
  })

  describe('complete-info (TRN-41, D-259)', () => {
    it('counts open sessions, no-score entries, and part-score entries (D-259)', async () => {
      const tournamentId = await rows.tournament()
      const open = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
      const closed = await rows.session(tournamentId, 'squad', '2026-10-24 15:00:00')
      await sweeper(tournamentId)
      const closedSweeper = await sweeper(tournamentId, '2026-10-24 13:00:00')
      await client.$executeRawUnsafe(
        'UPDATE Squads SET `Complete` = 1 WHERE Id IN (?, ?)',
        closed,
        closedSweeper,
      )
      // Open squad: one scored, one partial, two no-shows. The closed squad's no-show is not counted.
      const entered = await enter(tournamentId, open, 4, 1)
      await rows.score(entered[1] ?? '', open, 1)
      await enter(tournamentId, closed, 1)

      expect(await writer().getCompleteInfo(tournamentId)).toEqual({
        squadCount: 2,
        openSquadCount: 1,
        openSweeperCount: 1,
        noScoreCount: 2,
        partialCount: 1,
        payoutCount: 0,
        unpaidPayoutCount: 0,
        unpaidPayoutTotal: '0.00',
      })
    })

    it('answers zeros for a tournament with nothing in it', async () => {
      const tournamentId = await rows.tournament()

      expect(await writer().getCompleteInfo(tournamentId)).toEqual({
        squadCount: 0,
        openSquadCount: 0,
        openSweeperCount: 0,
        noScoreCount: 0,
        partialCount: 0,
        payoutCount: 0,
        unpaidPayoutCount: 0,
        unpaidPayoutTotal: '0.00',
      })
    })

    it('counts the payouts and the unpaid ones with their total (PAY-15, D-279)', async () => {
      const tournamentId = await rows.tournament()
      const payout = (amount: string, paid: boolean) =>
        client.$executeRawUnsafe(
          `INSERT INTO Payouts (Id, TournamentId, Source, EventId, RegistrationId, Amount, Paid, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy)
           VALUES (?, ?, 'squad', ?, ?, ?, ?, NOW(3), 'u', NOW(3), 'u')`,
          crypto.randomUUID(),
          tournamentId,
          crypto.randomUUID(),
          crypto.randomUUID(),
          amount,
          paid ? 1 : 0,
        )
      await payout('100.00', true)
      await payout('1000.50', false)
      await payout('449.50', false)

      expect(await writer().getCompleteInfo(tournamentId)).toMatchObject({
        payoutCount: 3,
        unpaidPayoutCount: 2,
        unpaidPayoutTotal: '1450.00',
      })
    })
  })
})
