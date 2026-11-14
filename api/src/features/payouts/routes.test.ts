import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import {
  createDivision,
  createLaneEntry,
  createRegistration,
  createSquad,
  createSweeper,
  createTournament,
  testApiKey,
} from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { recordingEvents } from '../../test/recordingEvents.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import { createInMemoryRegistrationRepository } from '../registrations/repository.ts'
import { createInMemoryScoreRepository } from '../scores/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import type { Gate } from './savePlan.ts'
import { createInMemoryPayoutStore, type EventFacts, type PayoutStore } from './store.ts'
import type { PayoutRecord } from './types.ts'

const tournament = createTournament()
const open = createDivision({ number: 1, name: 'Open' })
const squad = createSquad({
  date: '2026-10-24T09:00:00',
  finalsRatio: 4,
  cashRatio: 2,
  games: 3,
  complete: true,
})
const sweeper = createSweeper({
  date: '2026-10-24T13:00:00',
  cashRatio: 2,
  games: 3,
  complete: true,
})

/** Four bowlers: the best advances, the second cashes, the others do not (as the results tests). */
const bowlers = [0, 1, 2, 3].map((index) =>
  createLaneEntry({
    divisionId: open.id,
    average: null,
    position: `${index + 1}A`,
    name: ['Lois Park', 'Dana Whitfield', 'Marcus Lee', 'Tom Becker'][index] ?? 'Bowler',
  }),
)
const [advancer, casher, other, lowest] = bowlers
if (!advancer || !casher || !other || !lowest) throw new Error('no bowlers')

const base = `/v1/tournaments/${tournament.id}/payouts`
const squadUrl = `${base}/squad/${squad.id}`

const openFacts: EventFacts = {
  tournamentComplete: false,
  gate: { kind: 'squad', complete: true },
}

function setup(
  options: {
    facts?: EventFacts
    seed?: PayoutRecord[]
    role?: 'director' | 'scoreKeeper' | 'admin'
    store?: PayoutStore
  } = {},
) {
  const made = createInMemoryPayoutStore(options.seed ?? [], () => options.facts ?? openFacts)
  const recorded = recordingEvents()
  const captured = createCapturedLogger()
  const app = createSignedInTestApp(
    {
      tournaments: createInMemoryTournamentRepository([tournament]),
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: open },
      ]),
      squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
      sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
      lanes: createInMemoryLaneRepository(
        bowlers.flatMap((entry) => [
          { sessionId: squad.id, entry },
          { sessionId: sweeper.id, entry },
        ]),
      ),
      scores: createInMemoryScoreRepository(
        bowlers.flatMap((entry, index) =>
          [squad.id, sweeper.id].flatMap((sessionId) =>
            [1, 2, 3].map((game) => ({
              sessionId,
              score: { bowlerId: entry.bowlerId, game, score: 250 - index * 20 },
            })),
          ),
        ),
      ),
      registrations: createInMemoryRegistrationRepository(
        bowlers.map((entry) => ({
          tournamentId: tournament.id,
          registration: createRegistration({
            id: entry.registrationId,
            divisionId: open.id,
            bowler: {
              id: entry.bowlerId,
              name: entry.name,
              firstName: entry.firstName,
              lastName: entry.lastName,
              usbcId: '',
            },
          }),
        })),
      ),
      payoutStore: options.store ?? made.store,
      events: recorded.events,
      logger: captured.logger,
    },
    options.role,
  )
  return { app, ...made, published: recorded.published, captured }
}

const record = (over: Partial<PayoutRecord> = {}): PayoutRecord => ({
  id: crypto.randomUUID(),
  tournamentId: tournament.id,
  source: 'squad',
  eventId: squad.id,
  registrationId: casher.registrationId,
  amountCents: 10000,
  note: null,
  paid: false,
  ...over,
})

describe('GET payouts/squad/:sessionId (PAY-02, PAY-06, PAY-10, PAY-11)', () => {
  it('lists the casher as the payee and the rest as others, never the advancer (PAY-02, D-07)', async () => {
    const { app } = setup()

    const response = await request(app).get(squadUrl)

    expect(response.status).toBe(200)
    const { sheet } = response.body
    expect(sheet.status).toBe('open')
    expect(sheet.reason).toBeNull()
    expect(sheet.event).toEqual({
      source: 'squad',
      eventId: squad.id,
      label: 'Squad',
      date: squad.date,
      divisionName: null,
    })
    expect(sheet.payees).toEqual([
      {
        registrationId: casher.registrationId,
        name: 'Dana Whitfield',
        divisionName: 'Open',
        detail: 'cashed, place 2',
        seed: null,
        previousCasher: false,
        inferred: true,
        payout: null,
      },
    ])
    expect(sheet.others.map((item: { name: string }) => item.name)).toEqual([
      'Lois Park',
      'Marcus Lee',
      'Tom Becker',
    ])
  })

  it('shows a saved payout, and keeps a bowler added by hand on the sheet (PAY-06, D-269)', async () => {
    const { app } = setup({
      seed: [
        record({ amountCents: 10000, paid: true }),
        record({ registrationId: other.registrationId, amountCents: 2500, note: 'Lane breakdown' }),
      ],
    })

    const { sheet } = (await request(app).get(squadUrl)).body

    expect(sheet.payees).toHaveLength(2)
    expect(sheet.payees[0]).toMatchObject({
      inferred: true,
      payout: { amount: '100.00', note: null, paid: true },
    })
    expect(sheet.payees[1]).toMatchObject({
      name: 'Marcus Lee',
      inferred: false,
      detail: 'added by hand',
      payout: { amount: '25.00', note: 'Lane breakdown', paid: false },
    })
    expect(sheet.others.map((item: { name: string }) => item.name)).toEqual([
      'Lois Park',
      'Tom Becker',
    ])
  })

  it('says not ready, with the reason and no rows, until the squad is complete (PAY-10, D-272)', async () => {
    const { app } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'squad', complete: false } },
    })

    const { sheet } = (await request(app).get(squadUrl)).body

    expect(sheet).toMatchObject({
      status: 'notReady',
      reason: 'This squad is not complete. Complete it before you enter payouts.',
      payees: [],
      others: [],
      tournamentComplete: false,
    })
    expect(sheet.event.date).toBe(squad.date)
  })

  it('shows the saved payouts read only once the tournament is complete (PAY-11, D-273)', async () => {
    const { app } = setup({
      facts: { tournamentComplete: true, gate: { kind: 'squad', complete: true } },
      seed: [record()],
    })

    const { sheet } = (await request(app).get(squadUrl)).body

    expect(sheet).toMatchObject({
      status: 'locked',
      reason: 'This tournament is complete. Payouts are locked.',
      tournamentComplete: true,
    })
    expect(sheet.payees[0].payout.amount).toBe('100.00')
  })

  it('answers 404 for a squad or tournament it does not know, and 400 for a bad id', async () => {
    const { app } = setup({ facts: { notFound: 'event' } })

    expect((await request(app).get(squadUrl)).status).toBe(404)
    expect((await request(app).get(`${base}/squad/not-an-id`)).status).toBe(400)
    const missing = await request(setup({ facts: { notFound: 'tournament' } }).app).get(squadUrl)
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ message: 'Squad not found' })
  })
})

describe('GET the sheets of the other events (PAY-03 to PAY-05)', () => {
  it('lists the sweeper casher (PAY-03)', async () => {
    const { app } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'sweeper', complete: true } },
    })

    const { sheet } = (await request(app).get(`${base}/sweeper/${sweeper.id}`)).body

    expect(sheet.event).toMatchObject({ source: 'sweeper', label: 'Sweeper' })
    expect(sheet.payees.map((item: { name: string }) => item.name)).toEqual([
      'Lois Park',
      'Dana Whitfield',
    ])
  })

  it('opens the finals sheet of one division with the finalists in seed order (PAY-05)', async () => {
    const { app } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'finals', squads: 1, open: 0 } },
    })

    const { sheet } = (await request(app).get(`${base}/finals/${open.id}`)).body

    expect(sheet.event).toMatchObject({
      source: 'finals',
      label: 'Finals: Open',
      divisionName: 'Open',
    })
    expect(sheet.payees.length).toBeGreaterThan(0)
    expect(sheet.payees[0]).toMatchObject({ seed: 1, inferred: true })
    expect(sheet.payees[0].detail).toBe('seed 1')
  })

  it('says why the super sweeper is not ready (PAY-04, D-272)', async () => {
    const { app } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'superSweeper', sweepers: 3, open: 2 } },
    })

    const { sheet } = (await request(app).get(`${base}/super-sweeper`)).body

    expect(sheet).toMatchObject({
      status: 'notReady',
      reason:
        '2 of 3 sweepers are not complete. Complete them before you enter super sweeper payouts.',
    })
    expect(sheet.event.label).toBe('Super sweeper')
  })
})

describe('PUT payouts/squad/:sessionId (PAY-06, PAY-07, PAY-10 to PAY-12, PAY-21)', () => {
  it('saves the casher with no note, answers the fresh sheet, and publishes payouts (PAY-12, PAY-21)', async () => {
    const { app, records, published, captured } = setup()

    const response = await request(app)
      .put(squadUrl)
      .send({ payouts: [{ registrationId: casher.registrationId, amount: '100' }] })

    expect(response.status).toBe(200)
    expect(response.body.sheet.payees[0].payout).toMatchObject({ amount: '100.00', paid: false })
    expect(records).toHaveLength(1)
    // The session's own stream, then the TV page's stream of the tournament.
    expect(published).toEqual([
      { sessionId: squad.id, kind: 'payouts' },
      { sessionId: `live:${tournament.id}`, kind: 'payouts' },
    ])
    const line = captured.records().find((entry) => entry.msg === 'Payouts saved')
    expect(line).toMatchObject({ created: 1, changed: 0, deleted: 0, total: '100.00' })
    // Neither a name nor a note goes in the log.
    expect(JSON.stringify(captured.records())).not.toContain('Dana')
  })

  it('needs a note for a bowler the results did not infer (PAY-06, D-269)', async () => {
    const { app, records } = setup()

    const refused = await request(app)
      .put(squadUrl)
      .send({ payouts: [{ registrationId: other.registrationId, amount: '25' }] })

    expect(refused.status).toBe(400)
    expect(refused.body).toEqual({
      message: 'Fix the rows marked and save again.',
      errors: { [`note:${other.registrationId}`]: 'Say why this bowler is paid' },
    })
    expect(records).toHaveLength(0)

    const saved = await request(app)
      .put(squadUrl)
      .send({
        payouts: [{ registrationId: other.registrationId, amount: '25', note: 'Lane breakdown' }],
      })
    expect(saved.status).toBe(200)
    // The casher (inferred) is listed first, the bowler added by hand after.
    expect(saved.body.sheet.payees[1]).toMatchObject({ inferred: false, name: 'Marcus Lee' })
  })

  it('refuses a bad amount with the field and the words (PAY-07, D-270)', async () => {
    const { app } = setup()

    const response = await request(app)
      .put(squadUrl)
      .send({ payouts: [{ registrationId: casher.registrationId, amount: '0' }] })

    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual({
      [`amount:${casher.registrationId}`]: 'Enter an amount above $0.00',
    })
  })

  it('deletes a payout when its amount is cleared (PAY-07, PAY-12)', async () => {
    const { app, records } = setup({ seed: [record()] })

    const response = await request(app)
      .put(squadUrl)
      .send({ payouts: [{ registrationId: casher.registrationId, amount: '' }] })

    expect(response.status).toBe(200)
    expect(records).toHaveLength(0)
  })

  it('refuses a squad that is not complete with 409 and the reason, saving nothing (PAY-10)', async () => {
    const { app, records, published } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'squad', complete: false } },
    })

    const response = await request(app)
      .put(squadUrl)
      .send({ payouts: [{ registrationId: casher.registrationId, amount: '100' }] })

    const reason = 'This squad is not complete. Complete it before you enter payouts.'
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: reason, errors: { event: reason } })
    expect(records).toHaveLength(0)
    expect(published).toEqual([])
  })

  it('refuses everything once the tournament is complete (PAY-11, D-273)', async () => {
    const { app } = setup({
      facts: { tournamentComplete: true, gate: { kind: 'squad', complete: true } },
    })

    const response = await request(app)
      .put(squadUrl)
      .send({ payouts: [{ registrationId: casher.registrationId, amount: '100' }] })

    expect(response.status).toBe(409)
    expect(response.body.errors.event).toBe('This tournament is complete. Payouts are locked.')
  })

  it('asks before it changes a paid payout, then goes ahead with confirmPaid (PAY-12, D-273)', async () => {
    const { app, records } = setup({ seed: [record({ paid: true })] })
    const body = { payouts: [{ registrationId: casher.registrationId, amount: '90' }] }

    const asked = await request(app).put(squadUrl).send(body)

    expect(asked.status).toBe(409)
    expect(asked.body).toMatchObject({
      message: 'Confirm to change payouts that are already marked paid.',
      warnings: [{ field: 'paid', message: '1 of these payouts is marked paid.' }],
      paidChanges: [
        {
          registrationId: casher.registrationId,
          name: 'Dana Whitfield',
          from: '100.00',
          to: '90.00',
        },
      ],
    })
    expect(records[0]?.amountCents).toBe(10000)

    const done = await request(app)
      .put(squadUrl)
      .send({ ...body, confirmPaid: true })
    expect(done.status).toBe(200)
    expect(records[0]?.amountCents).toBe(9000)
  })

  it('answers 400 for a body that is not a save, a repeated bowler, or too many rows', async () => {
    const { app } = setup()
    const row = { registrationId: casher.registrationId, amount: '1' }

    expect((await request(app).put(squadUrl).send({})).status).toBe(400)
    expect(
      (
        await request(app)
          .put(squadUrl)
          .send({ payouts: [row, row] })
      ).status,
    ).toBe(400)
    const many = Array.from({ length: 501 }, () => ({
      registrationId: crypto.randomUUID(),
      amount: '1',
    }))
    expect((await request(app).put(squadUrl).send({ payouts: many })).status).toBe(400)
  })

  it('answers 404 for an unknown squad (PAY-12)', async () => {
    const { app } = setup({ facts: { notFound: 'event' } })

    const response = await request(app).put(squadUrl).send({ payouts: [] })

    expect(response.status).toBe(404)
  })

  it('tells only the tournament stream after a finals or super sweeper save (PAY-21)', async () => {
    const { app, published } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'finals', squads: 1, open: 0 } },
    })

    const response = await request(app)
      .put(`${base}/finals/${open.id}`)
      .send({ payouts: [{ registrationId: advancer.registrationId, amount: '1500' }] })

    expect(response.status).toBe(200)
    expect(published).toEqual([{ sessionId: `live:${tournament.id}`, kind: 'payouts' }])
  })
})

describe('PATCH payouts/:payoutId (PAY-13, D-274)', () => {
  it('sets and clears the paid flag and answers the payout', async () => {
    const stored = record()
    const { app, records, captured, published } = setup({ seed: [stored] })

    const set = await request(app).patch(`${base}/${stored.id}`).send({ paid: true })

    expect(set.status).toBe(200)
    expect(set.body).toEqual({
      payout: { id: stored.id, amount: '100.00', note: null, paid: true },
    })
    expect(records[0]?.paid).toBe(true)
    expect(captured.records().some((entry) => entry.msg === 'Payout paid flag set')).toBe(true)
    const cleared = await request(app).patch(`${base}/${stored.id}`).send({ paid: false })
    expect(cleared.body.payout.paid).toBe(false)
    // A paid flag changes no public page, so no screen is told (PAY-21).
    expect(published).toEqual([])
  })

  it('refuses once the tournament is complete, and answers 404 and 400 as it should (PAY-11)', async () => {
    const stored = record()
    const locked = setup({
      seed: [stored],
      facts: { tournamentComplete: true, gate: { kind: 'squad', complete: true } },
    })

    const refused = await request(locked.app).patch(`${base}/${stored.id}`).send({ paid: true })
    expect(refused.status).toBe(409)
    expect(refused.body.errors.event).toBe('This tournament is complete. Payouts are locked.')

    const { app } = setup({ seed: [stored] })
    expect(
      (await request(app).patch(`${base}/${crypto.randomUUID()}`).send({ paid: true })).status,
    ).toBe(404)
    expect((await request(app).patch(`${base}/${stored.id}`).send({ paid: 'yes' })).status).toBe(
      400,
    )
    expect((await request(app).patch(`${base}/nope`).send({ paid: true })).status).toBe(400)
  })
})

describe('body limits of the payout routes (PAY-12, PAY-13)', () => {
  const filler = (kb: number) => 'x'.repeat(kb * 1024)

  it('lets a save carry a body over 10 KB, up to 100 KB', async () => {
    const { app } = setup()

    const response = await request(app)
      .put(squadUrl)
      .send({ payouts: [], filler: filler(50) })

    expect(response.status).toBe(200)
  })

  it('refuses a save over 100 KB', async () => {
    const { app, records } = setup()

    const response = await request(app)
      .put(squadUrl)
      .send({ payouts: [], filler: filler(101) })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is too large.' })
    expect(records).toHaveLength(0)
  })

  it('keeps the paid flag at 10 KB', async () => {
    const stored = record()
    const { app } = setup({ seed: [stored] })

    const response = await request(app)
      .patch(`${base}/${stored.id}`)
      .send({ paid: true, filler: filler(11) })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is too large.' })
  })
})

describe('GET payouts and payouts/totals (PAY-19)', () => {
  const seed = [
    record({ amountCents: 10000, paid: true }),
    record({ source: 'sweeper', eventId: sweeper.id, amountCents: 25000 }),
    record({
      source: 'finals',
      eventId: open.id,
      registrationId: advancer.registrationId,
      amountCents: 150000,
      note: '1st overall',
    }),
    record({ source: 'superSweeper', eventId: tournament.id, amountCents: 50000 }),
  ]

  it('lists every payout with its event and bowler, squads first, and sums them', async () => {
    const { app } = setup({ seed })

    const response = await request(app).get(base)

    expect(response.status).toBe(200)
    expect(
      response.body.payouts.map((row: { eventLabel: string; name: string; amount: string }) => [
        row.eventLabel,
        row.name,
        row.amount,
      ]),
    ).toEqual([
      ['Squad', 'Dana Whitfield', '100.00'],
      ['Sweeper', 'Dana Whitfield', '250.00'],
      ['Super sweeper', 'Dana Whitfield', '500.00'],
      ['Finals: Open', 'Lois Park', '1500.00'],
    ])
    expect(response.body.payouts[0]).toMatchObject({ eventDate: squad.date, divisionName: 'Open' })
    expect(response.body.summary).toEqual({
      count: 4,
      total: '2350.00',
      paidCount: 1,
      unpaidCount: 3,
      unpaidTotal: '2250.00',
    })
    expect(response.body.tournamentComplete).toBe(false)
  })

  it('is empty for a tournament with no payouts, and 404 for an unknown one', async () => {
    const empty = await request(setup().app).get(base)
    expect(empty.body.payouts).toEqual([])
    expect(empty.body.summary.count).toBe(0)

    const missing = await request(setup().app).get(`/v1/tournaments/${crypto.randomUUID()}/payouts`)
    expect(missing.status).toBe(404)
  })

  it('totals each bowler across events, highest first, with a minimum (PAY-19, D-282)', async () => {
    const { app } = setup({ seed })

    const all = await request(app).get(`${base}/totals`)
    expect(all.body.bowlers).toEqual([
      {
        registrationId: advancer.registrationId,
        name: 'Lois Park',
        divisionName: 'Open',
        count: 1,
        total: '1500.00',
        unpaidTotal: '1500.00',
      },
      {
        registrationId: casher.registrationId,
        name: 'Dana Whitfield',
        divisionName: 'Open',
        count: 3,
        total: '850.00',
        unpaidTotal: '750.00',
      },
    ])
    const filtered = await request(app).get(`${base}/totals?min=1000`)
    expect(filtered.body.bowlers.map((row: { name: string }) => row.name)).toEqual(['Lois Park'])
    const equal = await request(app).get(`${base}/totals?min=850`)
    expect(equal.body.bowlers).toHaveLength(2)
  })

  it.each([['0'], ['0.00'], ['$0'], ['']])(
    'reads a minimum of %j as no minimum (PAY-19)',
    async (min) => {
      const { app } = setup({ seed })

      const response = await request(app).get(`${base}/totals`).query({ min })

      expect(response.status).toBe(200)
      expect(response.body.bowlers).toHaveLength(2)
    },
  )

  it('answers an empty list and no totals when nothing is saved, without reading registrations (PAY-19)', async () => {
    const { app } = setup()

    const list = await request(app).get(base)
    const totals = await request(app).get(`${base}/totals`)

    expect(list.body).toMatchObject({ payouts: [], summary: { count: 0 } })
    expect(totals.body).toEqual({ bowlers: [] })
  })

  it('refuses a minimum that is not money (PAY-19)', async () => {
    const { app } = setup({ seed })

    const response = await request(app).get(`${base}/totals?min=lots`)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Enter dollars and cents, like 100.00',
      errors: { min: 'Enter dollars and cents, like 100.00' },
    })
  })
})

describe('the sheet of each event when it is not ready (PAY-10, D-272)', () => {
  const closed = (gate: Gate) => ({ tournamentComplete: false, gate }) satisfies EventFacts

  it('names the squad and its date without working out any results', async () => {
    const { app } = setup({ facts: closed({ kind: 'squad', complete: false }) })

    const { sheet } = (await request(app).get(squadUrl)).body

    expect(sheet.event).toEqual({
      source: 'squad',
      eventId: squad.id,
      label: 'Squad',
      date: squad.date,
      divisionName: null,
    })
  })

  it('names the sweeper and its date', async () => {
    const { app } = setup({ facts: closed({ kind: 'sweeper', complete: false }) })

    const { sheet } = (await request(app).get(`${base}/sweeper/${sweeper.id}`)).body

    expect(sheet.event).toEqual({
      source: 'sweeper',
      eventId: sweeper.id,
      label: 'Sweeper',
      date: sweeper.date,
      divisionName: null,
    })
    expect(sheet).toMatchObject({ status: 'notReady', payees: [], others: [] })
  })

  it('names the division of the finals', async () => {
    const { app } = setup({ facts: closed({ kind: 'finals', squads: 4, open: 2 }) })

    const { sheet } = (await request(app).get(`${base}/finals/${open.id}`)).body

    expect(sheet.event).toEqual({
      source: 'finals',
      eventId: open.id,
      label: 'Finals: Open',
      date: null,
      divisionName: 'Open',
    })
    expect(sheet.reason).toBe(
      '2 of 4 squads are not complete. Complete them before you enter finals payouts.',
    )
  })

  it('names the super sweeper', async () => {
    const { app } = setup({ facts: closed({ kind: 'superSweeper', sweepers: 2, open: 1 }) })

    const { sheet } = (await request(app).get(`${base}/super-sweeper`)).body

    expect(sheet.event).toEqual({
      source: 'superSweeper',
      eventId: tournament.id,
      label: 'Super sweeper',
      date: null,
      divisionName: null,
    })
  })
})

describe('the sheet of an open event (PAY-04, PAY-05, D-269)', () => {
  it('shows only the payouts of this event, not the same bowler paid in another one (PAY-01)', async () => {
    const { app } = setup({
      seed: [
        record({ source: 'sweeper', eventId: sweeper.id, amountCents: 5000 }),
        record({ source: 'squad', eventId: crypto.randomUUID(), amountCents: 7000 }),
        record({ source: 'finals', eventId: open.id, amountCents: 9000 }),
      ],
    })

    const { sheet } = (await request(app).get(squadUrl)).body

    expect(sheet.payees.map((payee: { payout: unknown }) => payee.payout)).toEqual([null])
  })

  it('opens the super sweeper sheet with no one inferred when no bowler entered it', async () => {
    const { app } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'superSweeper', sweepers: 1, open: 0 } },
    })

    const { sheet } = (await request(app).get(`${base}/super-sweeper`)).body

    expect(sheet).toMatchObject({
      status: 'open',
      reason: null,
      payees: [],
      others: [],
      event: { label: 'Super sweeper', date: null },
    })
  })

  it('answers 404 for a division the results do not have', async () => {
    const { app } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'finals', squads: 1, open: 0 } },
    })

    const response = await request(app).get(`${base}/finals/${crypto.randomUUID()}`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Division not found' })
  })

  it('keeps a hand-added bowler on the sheet as not a previous casher, with the added-by-hand detail', async () => {
    const { app } = setup({
      seed: [record({ registrationId: other.registrationId, amountCents: 2500, note: 'why' })],
    })

    const { sheet } = (await request(app).get(squadUrl)).body

    expect(sheet.payees[1]).toMatchObject({
      inferred: false,
      previousCasher: false,
      seed: null,
      detail: 'added by hand',
      divisionName: 'Open',
    })
  })

  it('answers the not-found message of each kind of event', async () => {
    const gone = (path: string) =>
      request(setup({ facts: { notFound: 'event' } }).app).get(`${base}/${path}`)

    expect((await gone(`sweeper/${sweeper.id}`)).body).toEqual({ message: 'Sweeper not found' })
    expect((await gone('super-sweeper')).body).toEqual({ message: 'Tournament not found' })
    expect((await gone(`finals/${open.id}`)).body).toEqual({ message: 'Division not found' })
  })
})

describe('saves and toggles: what is logged and said (PAY-12, PAY-13, PAY-16)', () => {
  const put = (app: ReturnType<typeof setup>['app'], rows: unknown[], extra = {}) =>
    request(app)
      .put(squadUrl)
      .send({ payouts: rows, ...extra })

  it('logs a refused save with who, what, and where, and never a name or a note', async () => {
    const { app, captured } = setup({
      facts: { tournamentComplete: false, gate: { kind: 'squad', complete: false } },
    })

    await put(app, [{ registrationId: casher.registrationId, amount: '100', note: 'secret' }])

    const line = captured.records().find((entry) => entry.msg === 'Payouts save refused')
    expect(line).toMatchObject({ tournamentId: tournament.id, source: 'squad', eventId: squad.id })
    expect(line).toHaveProperty('actorId')
    expect(JSON.stringify(captured.records())).not.toContain('secret')
  })

  it('logs a save with a bad row as refused, with how many rows were marked', async () => {
    const { app, captured } = setup()

    await put(app, [
      { registrationId: casher.registrationId, amount: '-1' },
      { registrationId: other.registrationId, amount: '1', note: '' },
    ])

    const line = captured.records().find((entry) => entry.msg === 'Payouts save refused')
    expect(line).toMatchObject({ rows: 2, source: 'squad', eventId: squad.id })
  })

  it('says "2 of these payouts are marked paid" when two paid payouts would change', async () => {
    const { app } = setup({
      seed: [
        record({ paid: true }),
        record({ registrationId: advancer.registrationId, paid: true, amountCents: 5000 }),
      ],
    })

    const response = await put(app, [
      { registrationId: casher.registrationId, amount: '90' },
      { registrationId: advancer.registrationId, amount: '40', note: 'why' },
    ])

    expect(response.status).toBe(409)
    expect(response.body.warnings).toEqual([
      { field: 'paid', message: '2 of these payouts are marked paid.' },
    ])
    expect(response.body.paidChanges).toHaveLength(2)
  })

  it('answers 404 with the payout message, and logs nothing, for an unknown payout', async () => {
    const { app, captured } = setup()

    const response = await request(app).patch(`${base}/${crypto.randomUUID()}`).send({ paid: true })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Payout not found' })
    expect(captured.records().some((entry) => entry.msg === 'Payout paid flag set')).toBe(false)
  })

  it('logs a refused paid toggle, and logs a set only when the flag moved', async () => {
    const stored = record()
    const { app, captured } = setup({ seed: [stored] })

    await request(app).patch(`${base}/${stored.id}`).send({ paid: true })
    await request(app).patch(`${base}/${stored.id}`).send({ paid: true })

    const sets = captured.records().filter((entry) => entry.msg === 'Payout paid flag set')
    expect(sets).toHaveLength(1)
    expect(sets[0]).toMatchObject({ tournamentId: tournament.id, payoutId: stored.id, paid: true })

    const locked = setup({
      seed: [stored],
      facts: { tournamentComplete: true, gate: { kind: 'squad', complete: true } },
    })
    await request(locked.app).patch(`${base}/${stored.id}`).send({ paid: false })
    const refused = locked.captured
      .records()
      .find((entry) => entry.msg === 'Payout paid flag refused')
    expect(refused).toMatchObject({ tournamentId: tournament.id })
    expect(refused).toHaveProperty('actorId')
  })

  it('refuses a save of a locked tournament with the lock message in errors.event and the log (PAY-11)', async () => {
    const { app } = setup({
      facts: { tournamentComplete: true, gate: { kind: 'squad', complete: true } },
    })

    const response = await put(app, [])

    expect(response.body.errors).toEqual({
      event: 'This tournament is complete. Payouts are locked.',
    })
  })

  it('answers 404 for the totals of an unknown tournament', async () => {
    const { app } = setup()

    const response = await request(app).get(`/v1/tournaments/${crypto.randomUUID()}/payouts/totals`)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
  })

  it('answers 404 for the list of an unknown tournament with the tournament message', async () => {
    const { app } = setup()

    const response = await request(app).get(`/v1/tournaments/${crypto.randomUUID()}/payouts`)

    expect(response.body).toEqual({ message: 'Tournament not found' })
  })
})

describe('who may call the payout routes (PAY-16, D-275)', () => {
  const calls: [string, (app: ReturnType<typeof createTestApp>) => request.Test][] = [
    ['GET the list', (app) => request(app).get(base)],
    ['GET the totals', (app) => request(app).get(`${base}/totals`)],
    ['GET a sheet', (app) => request(app).get(squadUrl)],
    ['PUT a save', (app) => request(app).put(squadUrl).send({ payouts: [] })],
    [
      'PATCH the paid flag',
      (app) => request(app).patch(`${base}/${crypto.randomUUID()}`).send({ paid: true }),
    ],
  ]

  it.each(calls)('keeps the score keeper out: %s', async (_name, call) => {
    expect((await call(setup({ role: 'scoreKeeper' }).app)).status).toBe(403)
  })

  it.each(calls)('lets an admin in: %s', async (_name, call) => {
    const status = (await call(setup({ role: 'admin' }).app)).status
    expect([200, 404]).toContain(status)
  })

  it.each(calls)(
    'turns away a caller who is not signed in, and the API key: %s',
    async (_name, call) => {
      const app = createTestApp()
      expect((await call(app)).status).toBe(401)
      expect((await call(app).set(apiKeyHeader, testApiKey)).status).toBe(403)
    },
  )
})

describe('a storage outage', () => {
  it('answers a generic 503 and not the cause', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const store: PayoutStore = {
      listAmounts: outage,
      list: outage,
      eventFacts: outage,
      save: outage,
      setPaid: outage,
      summary: outage,
    }
    const { app } = setup({ store })

    const response = await request(app).get(squadUrl)

    expect(response.status).toBe(503)
  })
})
