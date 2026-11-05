import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows, type LegacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaTournamentWriter } from './prismaWriter.ts'

describe('Prisma tournament writer: update (TRN-24 to TRN-27, D-127 to D-130)', () => {
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

  const writer = () => createPrismaTournamentWriter(client, createCapturedLogger().logger)

  async function stored(id: string) {
    const [row] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT Name, DATE_FORMAT(Start, '%Y-%m-%d %H:%i:%s') AS Start,
              DATE_FORMAT(End, '%Y-%m-%d %H:%i:%s') AS End, EntryFee, Games, FinalsRatio, CashRatio,
              SuperSweperCashRatio, BowlingCenter, Completed
         FROM Tournaments WHERE Id = ?`,
      id,
    )
    return row
  }

  it('writes the changed columns and leaves the rest, Completed included (TRN-24)', async () => {
    const id = await rows.tournament()
    const before = await stored(id)

    const outcome = await writer().update(id, {
      name: 'Renamed',
      startDate: '2026-10-22',
      endDate: '2026-10-26',
      entryFee: 61.5,
      cashRatio: 4.5,
    })

    expect(outcome).toMatchObject({
      updated: {
        id,
        name: 'Renamed',
        startDate: '2026-10-22',
        endDate: '2026-10-26',
        entryFee: 61.5,
        cashRatio: 4.5,
        games: 6,
        finalsRatio: 7,
        superSweeperCashRatio: 4,
        bowlingCenter: 'Lanes',
      },
      changed: ['name', 'startDate', 'endDate', 'entryFee', 'cashRatio'],
    })
    expect(await stored(id)).toEqual({
      ...before,
      Name: 'Renamed',
      Start: '2026-10-22 00:00:00',
      End: '2026-10-26 00:00:00',
      EntryFee: expect.anything() as unknown,
      CashRatio: expect.anything() as unknown,
    })
    const after = await stored(id)
    expect(Number(after?.['EntryFee'])).toBe(61.5)
    expect(Number(after?.['CashRatio'])).toBe(4.5)
    expect(after?.['Completed']).toBe(before?.['Completed'])
  })

  it('answers notFound for an unknown id', async () => {
    expect(await writer().update(crypto.randomUUID(), { name: 'x' })).toEqual({ notFound: true })
  })

  it('writes nothing when no value differs', async () => {
    const id = await rows.tournament()
    const before = await stored(id)

    const outcome = await writer().update(id, { games: 6, bowlingCenter: 'Lanes' })

    expect(outcome).toMatchObject({ changed: [] })
    expect(await stored(id)).toEqual(before)
  })

  it('last save wins: the second edit overwrites the first (D-127)', async () => {
    const id = await rows.tournament()

    await writer().update(id, { name: 'First' })
    await writer().update(id, { name: 'Second' })

    expect((await stored(id))?.['Name']).toBe('Second')
  })

  it('leaves a stored super sweeper ratio of 0 alone when other fields change (D-17)', async () => {
    const id = crypto.randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO Tournaments
         (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, BowlingCenter, Completed)
       VALUES (?, 'Old', '2020-01-01', '2020-01-03', 50, 6, 7.0, 5.0, 'Lanes', 0)`,
      id,
    )

    await writer().update(id, { name: 'Old, renamed' })

    expect(Number((await stored(id))?.['SuperSweperCashRatio'])).toBe(0)
  })

  describe('complete (TRN-25, D-130)', () => {
    it('refuses every field and writes nothing', async () => {
      const id = await rows.tournament({ completed: true })
      const before = await stored(id)

      const outcome = await writer().update(id, {
        name: 'Renamed',
        games: 7,
        confirmWarnings: true,
      })

      expect(outcome).toMatchObject({
        refused: { name: expect.any(String), games: expect.any(String) },
      })
      expect(await stored(id)).toEqual(before)
    })
  })

  describe('scores (TRN-25, TRN-26, D-128)', () => {
    async function withScore(kind: 'squad' | 'sweeper') {
      const id = await rows.tournament()
      const { bowlerId } = await rows.registration(await rows.division(id))
      await rows.score(bowlerId, await rows.session(id, kind, '2026-10-24 09:00:00'))
      return id
    }

    it('refuses games and the start date, writes nothing', async () => {
      const id = await withScore('squad')
      const before = await stored(id)

      const outcome = await writer().update(id, { games: 7, startDate: '2026-10-22' })

      expect(outcome).toMatchObject({
        refused: { games: expect.any(String), startDate: expect.any(String) },
      })
      expect(await stored(id)).toEqual(before)
    })

    it('warns about a ratio, then saves it once confirmed', async () => {
      const id = await withScore('squad')

      const asked = await writer().update(id, { cashRatio: 4 })
      expect(asked).toMatchObject({ warnings: [{ field: 'cashRatio' }] })
      expect(Number((await stored(id))?.['CashRatio'])).toBe(5)

      await writer().update(id, { cashRatio: 4, confirmWarnings: true })
      expect(Number((await stored(id))?.['CashRatio'])).toBe(4)
    })

    it('warns about the super sweeper ratio only for sweeper scores', async () => {
      const squadOnly = await withScore('squad')
      const sweeper = await withScore('sweeper')

      expect(await writer().update(squadOnly, { superSweeperCashRatio: 6 })).toMatchObject({
        updated: { superSweeperCashRatio: 6 },
      })
      expect(await writer().update(sweeper, { superSweeperCashRatio: 6 })).toMatchObject({
        warnings: [{ field: 'superSweeperCashRatio' }],
      })
    })
  })

  describe('registrations (TRN-26, D-128)', () => {
    it('warns about the entry fee and the start date, counting this tournament only', async () => {
      const id = await rows.tournament()
      const other = await rows.tournament()
      const division = await rows.division(id)
      await rows.registration(division)
      await rows.registration(division)
      await rows.registration(await rows.division(other))

      const outcome = await writer().update(id, { entryFee: 75, startDate: '2026-10-22' })

      expect(outcome).toMatchObject({
        warnings: [
          { field: 'startDate', message: expect.stringContaining('2 bowlers are registered') },
          { field: 'entryFee', message: expect.stringContaining('2 bowlers are registered') },
        ],
      })
      expect(await writer().update(other, { entryFee: 75 })).toMatchObject({
        warnings: [{ message: expect.stringContaining('1 bowler is registered') }],
      })
    })

    it('does not warn without registrations', async () => {
      const id = await rows.tournament()

      expect(await writer().update(id, { entryFee: 75 })).toMatchObject({
        updated: { entryFee: 75 },
      })
    })
  })

  describe('dates and squads (TRN-25, D-128)', () => {
    it('refuses an end date before the last squad, naming it', async () => {
      const id = await rows.tournament()
      await rows.session(id, 'squad', '2026-10-25 09:00:00')

      const outcome = await writer().update(id, { endDate: '2026-10-24' })

      expect(outcome).toEqual({
        refused: {
          endDate:
            'Sunday 9:00 AM squad is on 2026-10-25, after this end date. Move or remove it first.',
        },
      })
    })

    it('allows an end date on the day of the last squad, even late in the evening', async () => {
      const id = await rows.tournament()
      await rows.session(id, 'sweeper', '2026-10-25 23:30:00')

      expect(await writer().update(id, { endDate: '2026-10-25' })).toMatchObject({ changed: [] })
      expect(await writer().update(id, { endDate: '2026-10-26' })).toMatchObject({
        updated: { endDate: '2026-10-26' },
      })
    })

    it('refuses a start date after the first sweeper', async () => {
      const id = await rows.tournament()
      await rows.session(id, 'sweeper', '2026-10-23 19:00:00')
      await rows.session(id, 'squad', '2026-10-24 09:00:00')

      const outcome = await writer().update(id, { startDate: '2026-10-24' })

      expect(outcome).toMatchObject({
        refused: { startDate: expect.stringContaining('Friday 7:00 PM sweeper is on 2026-10-23') },
      })
    })

    it('answers invalid when the dates would end up out of order', async () => {
      const id = await rows.tournament()

      expect(await writer().update(id, { endDate: '2026-10-22' })).toEqual({
        invalid: { endDate: 'End date must be on or after start date' },
      })
    })
  })

  describe('same name and start date (TRN-27, D-123)', () => {
    it('refuses another tournament’s name and start date, ignoring case and spaces', async () => {
      const first = await rows.tournament()
      const second = await rows.tournament()
      await client.$executeRawUnsafe(
        'UPDATE Tournaments SET Name = ? WHERE Id = ?',
        'Spring Open',
        first,
      )

      const outcome = await writer().update(second, { name: '  spring OPEN ' })

      expect(outcome).toEqual({ duplicate: true })
    })

    it('refuses a start date that lands on another tournament with the same name', async () => {
      const first = await rows.tournament({ start: '2026-10-23', end: '2026-10-25' })
      const second = await rows.tournament({ start: '2026-11-23', end: '2026-11-25' })
      await client.$executeRawUnsafe(
        'UPDATE Tournaments SET Name = ? WHERE Id IN (?, ?)',
        'Open',
        first,
        second,
      )

      expect(
        await writer().update(second, { startDate: '2026-10-23', endDate: '2026-10-25' }),
      ).toEqual({
        duplicate: true,
      })
    })

    it('counts a legacy row stored with a time of day', async () => {
      const first = await rows.tournament()
      const second = await rows.tournament()
      await client.$executeRawUnsafe(
        `UPDATE Tournaments SET Name = 'Open', Start = '2026-10-23 18:30:00' WHERE Id = ?`,
        first,
      )

      expect(await writer().update(second, { name: 'open' })).toEqual({ duplicate: true })
    })

    it('does not count the tournament against itself', async () => {
      const id = await rows.tournament()

      expect(await writer().update(id, { name: 'OPEN again' })).toMatchObject({ updated: {} })
      expect((await stored(id))?.['Name']).toBe('OPEN again')
    })

    it('lets only one of two simultaneous edits take the same name', async () => {
      const first = await rows.tournament()
      const second = await rows.tournament()

      const outcomes = await Promise.all([
        writer().update(first, { name: 'Same' }),
        writer().update(second, { name: 'Same' }),
      ])

      expect(outcomes.filter((outcome) => 'updated' in outcome)).toHaveLength(1)
      expect(outcomes.filter((outcome) => 'duplicate' in outcome)).toHaveLength(1)
      const [count] = await client.$queryRawUnsafe<{ total: bigint }[]>(
        `SELECT COUNT(*) AS total FROM Tournaments WHERE Name = 'Same'`,
      )
      expect(Number(count?.total)).toBe(1)
    })
  })
})
