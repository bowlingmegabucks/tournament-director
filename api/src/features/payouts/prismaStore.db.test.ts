import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import { legacyRows } from '../../test/legacyRows.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createPrismaPayoutStore } from './prismaStore.ts'
import type { SaveInput } from './store.ts'

describe('Prisma payout store', () => {
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

  const store = () => createPrismaPayoutStore(client, createCapturedLogger().logger)
  // `Squads.Complete` and `Tournaments.Completed` are the two flags (D-130).
  const complete = (table: 'Squads' | 'Tournaments', id: string) =>
    client.$executeRawUnsafe(
      `UPDATE ${table} SET ${table === 'Squads' ? 'Complete' : 'Completed'} = 1 WHERE Id = ?`,
      id,
    )

  async function world() {
    const rows = legacyRows(client)
    const tournamentId = await rows.tournament()
    const divisionId = await rows.division(tournamentId)
    const squadId = await rows.session(tournamentId, 'squad', '2026-10-24 09:00:00')
    const sweeperId = await rows.session(tournamentId, 'sweeper', '2026-10-24 13:00:00')
    const first = await rows.registration(divisionId)
    const second = await rows.registration(divisionId)
    const input = (overrides: Partial<SaveInput> = {}): SaveInput => ({
      tournamentId,
      source: 'squad',
      eventId: squadId,
      rows: [{ registrationId: first.registrationId, amount: '100' }],
      confirmPaid: false,
      actorId: 'user-1',
      inferred: new Set([first.registrationId]),
      entered: new Map([
        [first.registrationId, 'Dana Whitfield'],
        [second.registrationId, 'Marcus Lee'],
      ]),
      ...overrides,
    })
    return { tournamentId, divisionId, squadId, sweeperId, first, second, input }
  }

  it('stores a payout with its key, the actor, and the time (PAY-01)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)

    const outcome = await store().save(w.input())

    expect(outcome).toEqual({ saved: { created: 1, changed: 0, deleted: 0, total: '100.00' } })
    const rows = await client.payout.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tournamentId: w.tournamentId,
      source: 'squad',
      eventId: w.squadId,
      registrationId: w.first.registrationId,
      note: null,
      paid: false,
      createdBy: 'user-1',
      updatedBy: 'user-1',
    })
    expect(rows[0]?.amount.toFixed(2)).toBe('100.00')
  })

  it('refuses a second row for the same payee and event at the database (PAY-01)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)
    await store().save(w.input())
    const row = await client.payout.findFirstOrThrow()

    await expect(
      client.payout.create({ data: { ...row, id: crypto.randomUUID() } }),
    ).rejects.toThrow()
  })

  it('creates, changes, and deletes in one save, and leaves a row out untouched (PAY-12, D-278)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)
    await store().save(
      w.input({
        rows: [
          { registrationId: w.first.registrationId, amount: '100' },
          { registrationId: w.second.registrationId, amount: '25', note: 'Lane breakdown' },
        ],
      }),
    )

    const outcome = await store().save(
      w.input({ rows: [{ registrationId: w.second.registrationId, amount: '' }] }),
    )

    expect(outcome).toEqual({ saved: { created: 0, changed: 0, deleted: 1, total: '100.00' } })
    const left = await client.payout.findMany()
    expect(left.map((row) => row.registrationId)).toEqual([w.first.registrationId])

    const changed = await store().save(
      w.input({ rows: [{ registrationId: w.first.registrationId, amount: '120', paid: true }] }),
    )
    expect(changed).toEqual({ saved: { created: 0, changed: 1, deleted: 0, total: '120.00' } })
  })

  it('saves nothing when one row is refused (PAY-12)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)

    const outcome = await store().save(
      w.input({
        rows: [
          { registrationId: w.first.registrationId, amount: '100' },
          { registrationId: w.second.registrationId, amount: '25', note: '' },
        ],
      }),
    )

    expect(outcome).toEqual({
      invalid: { [`note:${w.second.registrationId}`]: 'Say why this bowler is paid' },
    })
    expect(await client.payout.count()).toBe(0)
  })

  it('asks before it changes a paid payout, then goes ahead when confirmed (PAY-12, D-273)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)
    await store().save(
      w.input({ rows: [{ registrationId: w.first.registrationId, amount: '100', paid: true }] }),
    )

    const asked = await store().save(
      w.input({ rows: [{ registrationId: w.first.registrationId, amount: '90' }] }),
    )
    expect(asked).toEqual({
      confirm: [
        {
          registrationId: w.first.registrationId,
          name: 'Dana Whitfield',
          from: '100.00',
          to: '90.00',
        },
      ],
    })

    const done = await store().save(
      w.input({
        rows: [{ registrationId: w.first.registrationId, amount: '90' }],
        confirmPaid: true,
      }),
    )
    expect(done).toMatchObject({ saved: { changed: 1, total: '90.00' } })
  })

  it('refuses a squad or a sweeper that is not complete (PAY-10, D-272)', async () => {
    const w = await world()

    expect(await store().save(w.input())).toEqual({
      refused: 'This squad is not complete. Complete it before you enter payouts.',
    })
    expect(await store().save(w.input({ source: 'sweeper', eventId: w.sweeperId }))).toEqual({
      refused: 'This sweeper is not complete. Complete it before you enter payouts.',
    })
    expect(await client.payout.count()).toBe(0)
  })

  it('opens the super sweeper only when every sweeper is complete (PAY-10)', async () => {
    const w = await world()
    const input = w.input({ source: 'superSweeper', eventId: w.tournamentId })

    expect(await store().save(input)).toEqual({
      refused:
        '1 of 1 sweepers is not complete. Complete it before you enter super sweeper payouts.',
    })
    await complete('Squads', w.sweeperId)
    expect(await store().save(input)).toMatchObject({ saved: { created: 1 } })
  })

  it('opens the finals only when every squad is complete (PAY-10)', async () => {
    const w = await world()
    const input = w.input({ source: 'finals', eventId: w.divisionId })

    expect(await store().save(input)).toEqual({
      refused: '1 of 1 squads is not complete. Complete it before you enter finals payouts.',
    })
    await complete('Squads', w.squadId)
    expect(await store().save(input)).toMatchObject({ saved: { created: 1 } })
  })

  it('answers not found for a tournament, a session, or a division it does not have', async () => {
    const w = await world()

    expect(await store().save(w.input({ tournamentId: crypto.randomUUID() }))).toEqual({
      notFound: 'tournament',
    })
    expect(await store().save(w.input({ eventId: crypto.randomUUID() }))).toEqual({
      notFound: 'event',
    })
    expect(await store().save(w.input({ source: 'squad', eventId: w.sweeperId }))).toEqual({
      notFound: 'event',
    })
    expect(await store().save(w.input({ source: 'finals', eventId: crypto.randomUUID() }))).toEqual(
      { notFound: 'event' },
    )
  })

  it('locks every payout once the tournament is complete (PAY-11, D-273)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)
    await store().save(w.input())
    const row = await client.payout.findFirstOrThrow()
    await complete('Tournaments', w.tournamentId)

    expect(await store().save(w.input())).toEqual({
      refused: 'This tournament is complete. Payouts are locked.',
    })
    expect(await store().setPaid(w.tournamentId, row.id, true, 'user-2')).toEqual({
      refused: 'This tournament is complete. Payouts are locked.',
    })
  })

  it('does not let two desks take the same payee twice (PAY-12, D-155)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)

    const [a, b] = await Promise.all([
      store().save(w.input()),
      store().save(w.input({ actorId: 'user-2' })),
    ])

    expect(await client.payout.count()).toBe(1)
    const created = [a, b].filter((outcome) => 'saved' in outcome && outcome.saved.created === 1)
    expect(created).toHaveLength(1)
  })

  it('sets the paid flag and says whether it moved (PAY-13, D-274)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)
    await store().save(w.input())
    const row = await client.payout.findFirstOrThrow()

    const set = await store().setPaid(w.tournamentId, row.id, true, 'user-2')
    expect(set).toMatchObject({ changed: true, payout: { paid: true } })
    expect(await store().setPaid(w.tournamentId, row.id, true, 'user-2')).toMatchObject({
      changed: false,
    })
    expect((await client.payout.findFirstOrThrow()).updatedBy).toBe('user-2')
    expect(await store().setPaid(w.tournamentId, crypto.randomUUID(), true, 'u')).toEqual({
      notFound: true,
    })
    expect(await store().setPaid(crypto.randomUUID(), row.id, true, 'u')).toEqual({
      notFound: true,
    })
  })

  it('lists, reads amounts, and counts the unpaid for the Complete dialog (PAY-15, PAY-19, PAY-20)', async () => {
    const w = await world()
    await complete('Squads', w.squadId)
    await store().save(
      w.input({
        rows: [
          { registrationId: w.first.registrationId, amount: '100', paid: true },
          { registrationId: w.second.registrationId, amount: '25.50', note: 'why' },
        ],
      }),
    )

    expect(await store().list(w.tournamentId)).toHaveLength(2)
    expect(await store().list(crypto.randomUUID())).toEqual([])
    const amounts = await store().listAmounts(w.tournamentId)
    expect(amounts.map((row) => row.amount).toSorted()).toEqual(['100.00', '25.50'])
    expect(Object.keys(amounts[0] ?? {}).toSorted()).toEqual([
      'amount',
      'eventId',
      'registrationId',
      'source',
    ])
    expect(await store().summary(w.tournamentId)).toEqual({
      count: 2,
      unpaidCount: 1,
      unpaidCents: 2550,
    })
    expect(await store().summary(crypto.randomUUID())).toEqual({
      count: 0,
      unpaidCount: 0,
      unpaidCents: 0,
    })
  })
})
