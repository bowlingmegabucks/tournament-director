import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaLaneRepository } from '../lanes/prismaRepository.ts'
import { createPrismaNoShowStore } from './prismaStore.ts'
import type { NoShowCommand } from './store.ts'

describe('Prisma no-show store', () => {
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

  const store = () => createPrismaNoShowStore(client, createCapturedLogger().logger)
  const run = (sql: string, ...values: unknown[]) => client.$executeRawUnsafe(sql, ...values)
  const complete = (sessionId: string) =>
    run('UPDATE Squads SET Complete = 1 WHERE Id = ?', sessionId)
  const zeros = async (bowlerId: string, sessionId: string) => {
    for (const game of [1, 2, 3]) {
      await run(
        'INSERT INTO SquadScores (BowlerId, SquadId, Game, Score) VALUES (?, ?, ?, 0)',
        bowlerId,
        sessionId,
        game,
      )
    }
  }
  const payout = async (
    tournamentId: string,
    eventId: string,
    registrationId: string,
    note: string | null = null,
  ) => {
    const id = crypto.randomUUID()
    await client.payout.create({
      data: {
        id,
        tournamentId,
        source: 'squad',
        eventId,
        registrationId,
        amount: '100.00',
        note,
        paid: true,
        createdAt: new Date('2026-11-26T12:00:00Z'),
        createdBy: 'director-1',
        updatedAt: new Date('2026-11-26T12:00:00Z'),
        updatedBy: 'director-1',
      },
    })
    return id
  }

  async function world() {
    const rows = legacyRows(client)
    const tournamentId = await rows.tournament()
    const divisionId = await rows.division(tournamentId)
    const source = await rows.session(tournamentId, 'squad', '2026-11-26 08:00:00')
    const target = await rows.session(tournamentId, 'squad', '2026-11-27 08:00:00')
    const sweeper = await rows.session(tournamentId, 'sweeper', '2026-11-26 18:00:00')
    const noShow = await rows.registration(divisionId)
    const other = await rows.registration(divisionId)
    await rows.squadEntry(noShow.registrationId, source, '3A')
    await rows.squadEntry(other.registrationId, source, '3B')
    await complete(source)
    await zeros(noShow.bowlerId, source)
    await rows.score(other.bowlerId, source)
    const command = (over: Partial<NoShowCommand> = {}): NoShowCommand => ({
      tournamentId,
      sourceSquadId: source,
      registrationId: noShow.registrationId,
      bowlerId: noShow.bowlerId,
      targetSquadId: target,
      deleteRegistration: false,
      keepAdvancing: [],
      notes: [],
      actorId: 'admin-1',
      ...over,
    })
    return { rows, tournamentId, source, target, sweeper, noShow, other, command }
  }

  const entriesOf = async (registrationId: string) =>
    client.squadRegistration.findMany({
      where: { registrationId },
      select: { squadId: true, laneAssignment: true, forcedAdvancer: true },
    })
  const scoresOf = (bowlerId: string) => client.squadScore.count({ where: { bowlerId } })

  it('moves the entry, drops the zeros and the lane, and writes the note (NSH-04, NSH-11)', async () => {
    const w = await world()
    const payoutId = await payout(w.tournamentId, w.source, w.other.registrationId)

    const outcome = await store().apply(w.command({ notes: [{ payoutId, note: 'Moved' }] }))

    expect(outcome).toBe('saved')
    expect(await entriesOf(w.noShow.registrationId)).toEqual([
      { squadId: w.target, laneAssignment: '', forcedAdvancer: false },
    ])
    expect(await scoresOf(w.noShow.bowlerId)).toBe(0)
    expect(await scoresOf(w.other.bowlerId)).toBe(1)
    const saved = await client.payout.findUniqueOrThrow({ where: { id: payoutId } })
    expect(saved).toMatchObject({ note: 'Moved', paid: true, updatedBy: 'admin-1' })
    expect(saved.amount.toFixed(2)).toBe('100.00')
  })

  it('flags the kept entry, and the squad then reads it as forced (NSH-20)', async () => {
    const w = await world()

    await store().apply(
      w.command({
        keepAdvancing: [{ squadId: w.source, registrationId: w.other.registrationId }],
      }),
    )

    const lanes = createPrismaLaneRepository(client, createCapturedLogger().logger)
    expect(await lanes.listEntries(w.source)).toMatchObject([
      { registrationId: w.other.registrationId, forcedAdvancer: true },
    ])
  })

  it('removes only the entry on a refund that keeps the registration (NSH-05)', async () => {
    const w = await world()
    await w.rows.squadEntry(w.noShow.registrationId, w.target)

    await store().apply(w.command({ targetSquadId: null }))

    expect((await entriesOf(w.noShow.registrationId)).map((entry) => entry.squadId)).toEqual([
      w.target,
    ])
  })

  it('deletes the registration with its sweeper entry and payments (NSH-06)', async () => {
    const w = await world()
    await w.rows.squadEntry(w.noShow.registrationId, w.sweeper)
    await w.rows.payment(w.noShow.registrationId, 'BowlingSite_abc', 80)

    const outcome = await store().apply(
      w.command({ targetSquadId: null, deleteRegistration: true }),
    )

    expect(outcome).toBe('saved')
    const where = { registrationId: w.noShow.registrationId }
    expect(await client.registration.count({ where: { id: where.registrationId } })).toBe(0)
    expect(await client.squadRegistration.count({ where })).toBe(0)
    expect(await client.payment.count({ where })).toBe(0)
    expect(await client.bowler.count({ where: { id: w.noShow.bowlerId } })).toBe(1)
  })

  // Timing: each fact below changes after the admin saw the preview.
  type World = Awaited<ReturnType<typeof world>>
  it.each<[string, (w: World) => Promise<unknown>, (w: World) => Partial<NoShowCommand>]>([
    [
      'the tournament was completed',
      (w) => run('UPDATE Tournaments SET Completed = 1 WHERE Id = ?', w.tournamentId),
      () => ({}),
    ],
    ['the target squad was completed', (w) => complete(w.target), () => ({})],
    [
      'the bowler was added to the target',
      (w) => w.rows.squadEntry(w.noShow.registrationId, w.target),
      () => ({}),
    ],
    [
      'the source entry is already gone',
      (w) => run('DELETE FROM SquadRegistration WHERE RegistrationId = ?', w.noShow.registrationId),
      () => ({}),
    ],
    [
      'a score appeared',
      (w) =>
        run(
          'UPDATE SquadScores SET Score = 180 WHERE BowlerId = ? AND Game = 1',
          w.noShow.bowlerId,
        ),
      () => ({}),
    ],
    [
      'a payout was saved for the no-show',
      (w) => payout(w.tournamentId, w.source, w.noShow.registrationId),
      () => ({}),
    ],
    [
      'another squad was added before a deleting refund',
      (w) => w.rows.squadEntry(w.noShow.registrationId, w.target),
      () => ({ targetSquadId: null, deleteRegistration: true }),
    ],
    [
      'a sweeper score appeared before a deleting refund',
      (w) => w.rows.score(w.noShow.bowlerId, w.sweeper),
      () => ({ targetSquadId: null, deleteRegistration: true }),
    ],
  ])('writes nothing when %s', async (_name, change, over) => {
    const w = await world()
    await change(w)
    const before = await entriesOf(w.noShow.registrationId)

    const outcome = await store().apply(w.command(over(w)))

    expect(outcome).toBe('changed')
    expect(await entriesOf(w.noShow.registrationId)).toEqual(before)
    expect(await scoresOf(w.noShow.bowlerId)).toBeGreaterThanOrEqual(3)
  })

  it('writes nothing when a payout got a note since the preview (NSH-11)', async () => {
    const w = await world()
    const payoutId = await payout(w.tournamentId, w.source, w.other.registrationId, 'By hand')

    const outcome = await store().apply(w.command({ notes: [{ payoutId, note: 'Moved' }] }))

    expect(outcome).toBe('changed')
    expect(await scoresOf(w.noShow.bowlerId)).toBe(3)
  })

  it('moves once when two admins confirm at the same time', async () => {
    const w = await world()

    const outcomes = await Promise.all([store().apply(w.command()), store().apply(w.command())])

    expect(outcomes.toSorted()).toEqual(['changed', 'saved'])
    expect(await entriesOf(w.noShow.registrationId)).toHaveLength(1)
  })
})
