import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from './database.ts'
import { createSessionDeleter } from './sessionDeleteStore.ts'
import type { SessionKind } from './sessionDelete.ts'
import { legacyRows, type LegacyRows } from '../test/legacyRows.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'

describe.each<SessionKind>(['squad', 'sweeper'])(
  'Prisma %s delete (SQD-14, D-186 to D-189)',
  (kind) => {
    const other: SessionKind = kind === 'squad' ? 'sweeper' : 'squad'
    let client: PrismaClient
    let rows: LegacyRows

    beforeAll(() => {
      client = createDatabaseClient(inject('databaseUrl'))
      rows = legacyRows(client)
    })
    afterAll(async () => {
      await client.$disconnect()
    })
    beforeEach(async () => {
      await resetDatabase(client)
    })

    const deleter = () => createSessionDeleter(client, createCapturedLogger().logger, kind)

    /** The one number a `SELECT COUNT(*) AS n` returns. */
    const countOf = async (sql: string, ...values: unknown[]) => {
      const [row] = await client.$queryRawUnsafe<{ n: bigint }[]>(sql, ...values)
      return Number(row?.n ?? -1)
    }
    const exists = async (id: string) =>
      (await countOf('SELECT COUNT(*) AS n FROM Squads WHERE Id = ?', id)) > 0

    it('removes the row of an empty, open session and answers deleted (SQD-14, D-189)', async () => {
      const tournamentId = await rows.tournament()
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
      const kept = await rows.session(tournamentId, kind, '2026-10-24 12:00:00')

      const outcome = await deleter().remove(tournamentId, id)

      expect(outcome).toEqual({ deleted: true })
      expect(await exists(id)).toBe(false)
      expect(await exists(kept)).toBe(true)
    })

    it('deletes the last session of a tournament (D-186)', async () => {
      const tournamentId = await rows.tournament()
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')

      expect(await deleter().remove(tournamentId, id)).toEqual({ deleted: true })
    })

    it('refuses entered bowlers and keeps the session and every entry (SQD-14, D-06, D-11, D-186)', async () => {
      const tournamentId = await rows.tournament()
      const division = await rows.division(tournamentId)
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
      for (let n = 0; n < 2; n += 1) {
        const { registrationId } = await rows.registration(division)
        await rows.squadEntry(registrationId, id)
      }

      const outcome = await deleter().remove(tournamentId, id)

      expect(outcome).toEqual({
        refused: {
          entries: `2 bowlers are entered in this ${kind}. Remove them from the ${kind} first.`,
        },
      })
      expect(await exists(id)).toBe(true)
      expect(
        await countOf('SELECT COUNT(*) AS n FROM SquadRegistration WHERE SquadId = ?', id),
      ).toBe(2)
    })

    it('refuses saved scores and keeps them (SQD-14, D-186)', async () => {
      const tournamentId = await rows.tournament()
      const division = await rows.division(tournamentId)
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
      const { bowlerId } = await rows.registration(division)
      await rows.score(bowlerId, id)

      const outcome = await deleter().remove(tournamentId, id)

      expect(outcome).toEqual({
        refused: { scores: `Scores are saved for this ${kind}, so it cannot be deleted.` },
      })
      expect(await countOf('SELECT COUNT(*) AS n FROM SquadScores WHERE SquadId = ?', id)).toBe(1)
    })

    it('refuses a complete session (SQD-17, SQD-18, D-10)', async () => {
      const tournamentId = await rows.tournament()
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
      await client.$executeRawUnsafe('UPDATE Squads SET Complete = 1 WHERE Id = ?', id)

      const outcome = await deleter().remove(tournamentId, id)

      expect(outcome).toEqual({
        refused: { session: `This ${kind} is complete and cannot be deleted.` },
      })
      expect(await exists(id)).toBe(true)
    })

    it('refuses in a complete tournament and lists every reason (D-130, D-186)', async () => {
      const tournamentId = await rows.tournament({ completed: true })
      const division = await rows.division(tournamentId)
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
      const { registrationId, bowlerId } = await rows.registration(division)
      await rows.squadEntry(registrationId, id)
      await rows.score(bowlerId, id)

      const outcome = await deleter().remove(tournamentId, id)

      expect(outcome).toMatchObject({ refused: {} })
      const errors = 'refused' in outcome ? outcome.refused : {}
      expect(Object.keys(errors)).toEqual(['tournament', 'entries', 'scores'])
      expect(await exists(id)).toBe(true)
    })

    it('answers not found for an unknown tournament, an unknown id, another tournament, and the other kind (SQD-14)', async () => {
      const tournamentId = await rows.tournament()
      const elsewhere = await rows.tournament()
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
      const wrongKind = await rows.session(tournamentId, other, '2026-10-24 12:00:00')
      const unknown = crypto.randomUUID()

      expect(await deleter().remove(unknown, id)).toEqual({ notFound: 'tournament' })
      expect(await deleter().remove(tournamentId, unknown)).toEqual({ notFound: 'session' })
      expect(await deleter().remove(elsewhere, id)).toEqual({ notFound: 'session' })
      expect(await deleter().remove(tournamentId, wrongKind)).toEqual({ notFound: 'session' })
      expect(await exists(id)).toBe(true)
      expect(await exists(wrongKind)).toBe(true)
    })

    it('deletes a row the list would skip, as a clean-up (D-42, D-189)', async () => {
      const tournamentId = await rows.tournament()
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
      // A sweeper with no fee, games, or cash ratio is skipped by the list. A squad's columns are
      // all required, so this only changes a sweeper; the delete reads only `Complete`.
      await client.$executeRawUnsafe('UPDATE Squads SET SweeperEntryFee = NULL WHERE Id = ?', id)

      expect(await deleter().remove(tournamentId, id)).toEqual({ deleted: true })
    })

    it('counts only this session’s entries and scores (D-188)', async () => {
      const tournamentId = await rows.tournament()
      const division = await rows.division(tournamentId)
      const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
      const busy = await rows.session(tournamentId, kind, '2026-10-24 12:00:00')
      const { registrationId, bowlerId } = await rows.registration(division)
      await rows.squadEntry(registrationId, busy)
      await rows.score(bowlerId, busy)

      expect(await deleter().getDeleteInfo(tournamentId, id)).toEqual({
        entryCount: 0,
        scoreCount: 0,
      })
      expect(await deleter().getDeleteInfo(tournamentId, busy)).toEqual({
        entryCount: 1,
        scoreCount: 1,
      })
    })

    it('answers not found for delete-info the same way (D-188)', async () => {
      const tournamentId = await rows.tournament()
      const id = await rows.session(tournamentId, other, '2026-10-24 09:00:00')

      expect(await deleter().getDeleteInfo(crypto.randomUUID(), id)).toEqual({
        notFound: 'tournament',
      })
      expect(await deleter().getDeleteInfo(tournamentId, id)).toEqual({ notFound: 'session' })
    })

    it('lets exactly one of a delete and a new entry win, every time (D-189)', async () => {
      const tournamentId = await rows.tournament()
      const division = await rows.division(tournamentId)

      // Which one wins varies from round to round, so check each round on its own: an entry saved
      // in the session means the delete was refused, and a delete that went through means the
      // entry failed on its key. Never both, never neither.
      for (let round = 0; round < 12; round += 1) {
        const id = await rows.session(tournamentId, kind, '2026-10-24 09:00:00')
        const { registrationId } = await rows.registration(division)

        const [removed, entered] = await Promise.allSettled([
          deleter().remove(tournamentId, id),
          rows.squadEntry(registrationId, id),
        ])

        const entries = await countOf(
          'SELECT COUNT(*) AS n FROM SquadRegistration WHERE SquadId = ?',
          id,
        )
        expect(removed.status).toBe('fulfilled')
        const deleted = removed.status === 'fulfilled' && 'deleted' in removed.value
        expect(deleted).toBe(entered.status === 'rejected')
        expect(await exists(id)).toBe(!deleted)
        expect(entries).toBe(deleted ? 0 : 1)
      }
      const orphans = await countOf(
        `SELECT COUNT(*) AS n FROM SquadRegistration e
         LEFT JOIN Squads s ON s.Id = e.SquadId WHERE s.Id IS NULL`,
      )
      expect(orphans).toBe(0)
    })
  },
)

describe('Prisma sweeper delete: bonus pins (DIV-14, D-152, D-186)', () => {
  let client: PrismaClient
  let rows: LegacyRows

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
    rows = legacyRows(client)
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
  })

  it('removes the sweeper’s bonus-pin rows and leaves another sweeper’s (DIV-14)', async () => {
    const tournamentId = await rows.tournament()
    const open = await rows.division(tournamentId, { name: 'Open', number: 1 })
    const gone = await rows.session(tournamentId, 'sweeper', '2026-10-24 19:00:00')
    const kept = await rows.session(tournamentId, 'sweeper', '2026-10-25 19:00:00')
    await rows.sweeperPins(gone, open, 10)
    await rows.sweeperPins(kept, open, 5)

    const outcome = await createSessionDeleter(
      client,
      createCapturedLogger().logger,
      'sweeper',
    ).remove(tournamentId, gone)

    expect(outcome).toEqual({ deleted: true })
    const left = await client.$queryRawUnsafe<{ SweeperId: string }[]>(
      'SELECT SweeperId FROM SweeperDivision',
    )
    expect(left.map((row) => row.SweeperId)).toEqual([kept])
  })
})
