import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import {
  createRegistration,
  createSweeper,
  createTournament,
  testApiKey,
} from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { recordingEvents } from '../../test/recordingEvents.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import { createInMemoryPayoutStore } from '../payouts/store.ts'
import type { PayoutRecord } from '../payouts/types.ts'
import { createInMemoryRegistrationRepository } from '../registrations/repository.ts'
import { createInMemoryRegistrationWriter } from '../registrations/writer.ts'
import { createInMemoryScoreRepository } from '../scores/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import type { Squad } from '../squads/types.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import {
  field,
  idOf,
  noShow,
  open,
  openSquad,
  person,
  scoresOf,
  squadOne,
  squadTwo,
  type Bowled,
} from './noShow.testData.ts'
import { createInMemoryNoShowStore } from './store.ts'

const tournament = createTournament({ id: idOf(50) })
const sweeper = createSweeper({ id: idOf(60), date: '2026-11-26T18:00:00' })

const base = (squadId = squadOne.id, registrationId = noShow.registrationId) =>
  `/v1/tournaments/${tournament.id}/squads/${squadId}/no-shows/${registrationId}`
const moveBody = { action: 'move', targetSquadId: openSquad.id }
const refundBody = { action: 'refund' }

interface Options {
  /** Bowlers who bowled squad one; the no-show is one more entry. */
  bowled?: number
  squads?: Squad[]
  secondSquad?: Bowled[]
  /** The no-show's score each game. */
  noShowScore?: number
  /** Squads and sweepers the no-show is entered in, besides squad one. */
  alsoIn?: string[]
  /** Sweepers and squads where the no-show has a score, besides squad one. */
  alsoScored?: string[]
  payouts?: PayoutRecord[]
  completed?: boolean
  payments?: number
  role?: 'admin' | 'director' | 'scoreKeeper'
  answer?: 'saved' | 'changed'
}

const payout = (over: Partial<PayoutRecord> = {}): PayoutRecord => ({
  id: idOf(700),
  tournamentId: tournament.id,
  source: 'squad',
  eventId: squadOne.id,
  registrationId: person(3).registrationId,
  amountCents: 10000,
  note: null,
  paid: true,
  ...over,
})

function world(options: Options = {}) {
  const bowled = [
    ...field(options.bowled ?? 19),
    { entry: noShow, score: options.noShowScore ?? 0 },
  ]
  const second = options.secondSquad ?? []
  const squads = options.squads ?? [squadOne, openSquad]
  const alsoIn = options.alsoIn ?? []
  const entries = [
    ...bowled.map((item) => ({ sessionId: squadOne.id, entry: item.entry })),
    ...second.map((item) => ({ sessionId: squadTwo.id, entry: item.entry })),
    ...alsoIn.map((sessionId) => ({ sessionId, entry: noShow })),
  ]
  const recorded = recordingEvents()
  const captured = createCapturedLogger()
  const noShows = createInMemoryNoShowStore(options.answer)
  const payouts = createInMemoryPayoutStore(options.payouts ?? [])
  const writer = createInMemoryRegistrationWriter({
    bowlers: [
      {
        id: noShow.bowlerId,
        firstName: 'Nora',
        lastName: 'Noshow',
      } as never,
    ],
    registrations: [
      {
        tournamentId: tournament.id,
        registration: {
          id: noShow.registrationId,
          bowlerId: noShow.bowlerId,
          divisionId: open.id,
          average: null,
          superSweeper: false,
          sessionIds: [squadOne.id, ...alsoIn],
        },
      },
    ],
    divisions: [{ id: open.id, tournamentId: tournament.id, name: 'Open' }],
    sessions: [
      ...squads.map((squad) => ({
        id: squad.id,
        tournamentId: tournament.id,
        kind: 'squad' as const,
        complete: squad.complete,
        date: squad.date,
      })),
      {
        id: sweeper.id,
        tournamentId: tournament.id,
        kind: 'sweeper' as const,
        complete: false,
        date: sweeper.date,
      },
    ],
    payments: options.payments
      ? [
          {
            registrationId: noShow.registrationId,
            confirmationCode: 'BowlingSite_abc',
            amount: options.payments,
          },
        ]
      : [],
    scores: [squadOne.id, ...(options.alsoScored ?? [])].map((sessionId) => ({
      bowlerId: noShow.bowlerId,
      sessionId,
    })),
    completedTournamentIds: options.completed ? [tournament.id] : [],
  })
  const overrides = {
    tournaments: createInMemoryTournamentRepository(
      [tournament],
      { [tournament.id]: { finalsRatio: 7, superSweeperCashRatio: 8 } },
      {
        [tournament.id]: {
          games: 3,
          finalsRatio: 7,
          cashRatio: 5,
          superSweeperCashRatio: 8,
          completed: options.completed ?? false,
        },
      },
    ),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division: open }]),
    squads: createInMemorySquadRepository(
      squads.map((squad) => ({ tournamentId: tournament.id, squad })),
    ),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    lanes: createInMemoryLaneRepository(entries),
    scores: createInMemoryScoreRepository([
      ...bowled.flatMap((item) =>
        scoresOf(item).map((score) => ({ sessionId: squadOne.id, score })),
      ),
      ...second.flatMap((item) =>
        scoresOf(item).map((score) => ({ sessionId: squadTwo.id, score })),
      ),
    ]),
    registrations: createInMemoryRegistrationRepository([
      {
        tournamentId: tournament.id,
        registration: createRegistration({ id: noShow.registrationId, divisionId: open.id }),
      },
    ]),
    registrationWriter: writer.writer,
    payoutStore: payouts.store,
    noShowStore: noShows.store,
    events: recorded.events,
    logger: captured.logger,
  }
  return {
    overrides,
    app: createSignedInTestApp(overrides, options.role ?? 'admin'),
    commands: noShows.commands,
    published: recorded.published,
    captured,
  }
}

const previewOf = async (app: ReturnType<typeof world>['app'], body: object, url = base()) =>
  request(app).post(`${url}/preview`).send(body)

describe('who may call the no-show routes (NSH-01)', () => {
  it.each(['director', 'scoreKeeper'] as const)('refuses a %s with 403', async (role) => {
    const { app, commands } = world({ role })

    const preview = await previewOf(app, moveBody)
    const apply = await request(app)
      .post(base())
      .send({ ...moveBody, version: 'x' })

    expect(preview.status).toBe(403)
    expect(apply.status).toBe(403)
    expect(commands).toEqual([])
  })

  it('refuses a caller who is signed out, and the API key', async () => {
    const app = createTestApp(world().overrides)

    const anonymous = await request(app).post(`${base()}/preview`).send(moveBody)
    const keyed = await request(app)
      .post(`${base()}/preview`)
      .set(apiKeyHeader, testApiKey)
      .send(moveBody)

    expect(anonymous.status).toBe(401)
    expect(keyed.status).toBe(403)
  })
})

describe('refusals (NSH-02 to NSH-08)', () => {
  it.each<[string, Options, object, string]>([
    ['a complete tournament', { completed: true }, moveBody, 'tournament'],
    [
      'an open source squad',
      { squads: [{ ...squadOne, complete: false }, openSquad] },
      moveBody,
      'squad',
    ],
    ['a bowler with a score', { noShowScore: 150 }, moveBody, 'noShow'],
    [
      'a complete target',
      { squads: [squadOne, { ...openSquad, complete: true }] },
      moveBody,
      'target',
    ],
    ['a target already entered', { alsoIn: [openSquad.id] }, moveBody, 'target'],
    ['a target that is not a squad', {}, { action: 'move', targetSquadId: sweeper.id }, 'target'],
    ['the same squad as the target', {}, { action: 'move', targetSquadId: squadOne.id }, 'target'],
    [
      'a payout of the no-show in the squad',
      { payouts: [payout({ registrationId: noShow.registrationId })] },
      moveBody,
      'payout',
    ],
    [
      'any payout of a registration the refund would delete',
      {
        payouts: [
          payout({ source: 'sweeper', eventId: sweeper.id, registrationId: noShow.registrationId }),
        ],
      },
      refundBody,
      'payout',
    ],
    [
      'a refund that deletes a registration with a sweeper score',
      { alsoIn: [sweeper.id], alsoScored: [sweeper.id] },
      refundBody,
      'scores',
    ],
  ])('refuses %s with 409', async (_name, options, body, key) => {
    const { app, commands, captured } = world(options)

    const response = await previewOf(app, body)

    expect(response.status).toBe(409)
    expect(Object.keys(response.body.errors)).toContain(key)
    expect(commands).toEqual([])
    expect(captured.records().some((line) => line.msg === 'No-show change refused')).toBe(true)
  })

  it('answers 404 for a bowler who is not entered, and for an unknown squad', async () => {
    const { app } = world()

    const stranger = await previewOf(app, moveBody, base(squadOne.id, idOf(999)))
    const squad = await previewOf(app, moveBody, base(idOf(998)))

    expect(stranger.status).toBe(404)
    expect(squad.status).toBe(404)
  })

  it.each([
    ['no action', {}],
    ['a move with no target', { action: 'move' }],
    ['an unknown field', { action: 'refund', amount: 5 }],
  ])('answers 400 for %s', async (_name, body) => {
    const { app } = world()

    const response = await previewOf(app, body)

    expect(response.status).toBe(400)
  })

  it('still lets a bowler with a sweeper score be moved', async () => {
    const { app } = world({ alsoIn: [sweeper.id], alsoScored: [sweeper.id] })

    const response = await previewOf(app, moveBody)

    expect(response.status).toBe(200)
  })
})

describe('preview (NSH-09 to NSH-11)', () => {
  it('names the casher who drops out and the note their payout gets', async () => {
    const { app, commands } = world({ payouts: [payout()] })

    const response = await previewOf(app, moveBody)

    expect(response.status).toBe(200)
    expect(response.body.preview).toMatchObject({
      action: 'move',
      bowlerName: 'Nora Noshow',
      source: { id: squadOne.id },
      target: { id: openSquad.id },
      deletesRegistration: false,
      warnings: [],
      changes: [{ change: 'losesCash', name: 'Dee Lane' }],
      payouts: [
        {
          name: 'Dee Lane',
          label: 'Squad 11/26 8:00 AM',
          amount: '100.00',
          note: 'Nora Noshow moved from the 11/26 8:00 AM squad to the 11/27 8:00 AM squad after completion.',
        },
      ],
    })
    // A preview saves nothing.
    expect(commands).toEqual([])
  })

  it('keeps a note that is already there', async () => {
    const { app } = world({ payouts: [payout({ note: 'Paid in cash' })] })

    const response = await previewOf(app, moveBody)

    expect(response.body.preview.payouts).toMatchObject([{ note: null }])
  })

  it('notes a finals payout of a bowler who leaves the finals', async () => {
    const finals = payout({
      source: 'finals',
      eventId: open.id,
      registrationId: person(2).registrationId,
    })
    const { app } = world({ bowled: 20, squads: [squadOne], payouts: [finals] })

    const response = await previewOf(app, refundBody)

    expect(response.body.preview.payouts).toMatchObject([
      {
        label: 'Finals: Open',
        name: 'Cal Lane',
        note: 'Nora Noshow refunded from the 11/26 8:00 AM squad after completion.',
      },
    ])
  })

  it('leaves a finals payout alone when the bowler is kept advancing', async () => {
    const finals = payout({
      source: 'finals',
      eventId: open.id,
      registrationId: person(2).registrationId,
    })
    const { app } = world({ bowled: 20, squads: [squadOne], payouts: [finals] })

    const response = await previewOf(app, {
      ...refundBody,
      keepAdvancing: [{ squadId: squadOne.id, registrationId: person(2).registrationId }],
    })

    expect(response.body.preview.payouts).toEqual([])
  })

  it('says nothing about a payout that is still earned', async () => {
    const { app } = world({ payouts: [payout({ registrationId: person(2).registrationId })] })

    const response = await previewOf(app, moveBody)

    expect(response.body.preview.payouts).toEqual([])
  })

  it('warns that a refund of the only squad entry ends sweeper eligibility (NSH-06)', async () => {
    const { app } = world({ alsoIn: [sweeper.id], payments: 80 })

    const response = await previewOf(app, refundBody)

    expect(response.body.preview.deletesRegistration).toBe(true)
    expect(response.body.preview.warnings).toEqual([
      expect.stringContaining('ineligible for sweepers'),
      expect.stringContaining('$80.00'),
    ])
  })

  it('keeps the registration when another squad entry remains', async () => {
    const { app } = world({ alsoIn: [openSquad.id] })

    const response = await previewOf(app, refundBody)

    expect(response.body.preview).toMatchObject({ deletesRegistration: false, warnings: [] })
  })

  it('offers to keep a bowler who would stop advancing, and shows the effect of the tick', async () => {
    const { app } = world({ bowled: 20 })
    const cal = { squadId: squadOne.id, registrationId: person(2).registrationId }

    const unticked = await previewOf(app, moveBody)
    const ticked = await previewOf(app, { ...moveBody, keepAdvancing: [cal] })

    expect(unticked.body.preview.keepAdvancing).toMatchObject([{ name: 'Cal Lane', kept: false }])
    expect(ticked.body.preview.keepAdvancing).toMatchObject([{ name: 'Cal Lane', kept: true }])
    expect(ticked.body.preview.changes).toEqual([])
    expect(ticked.body.preview.version).not.toBe(unticked.body.preview.version)
  })
})

describe('save (NSH-04 to NSH-06, NSH-14)', () => {
  async function applied(options: Options, body: object) {
    const made = world(options)
    const { preview } = (await previewOf(made.app, body)).body
    const response = await request(made.app)
      .post(base())
      .send({ ...body, version: preview.version })
    return { ...made, preview, response }
  }

  it('moves the entry and writes the notes', async () => {
    const { response, commands, preview } = await applied({ payouts: [payout()] }, moveBody)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ deletedRegistration: false })
    expect(commands).toEqual([
      {
        tournamentId: tournament.id,
        sourceSquadId: squadOne.id,
        registrationId: noShow.registrationId,
        bowlerId: noShow.bowlerId,
        targetSquadId: openSquad.id,
        deleteRegistration: false,
        keepAdvancing: [],
        notes: [{ payoutId: idOf(700), note: preview.payouts[0].note }],
        actorId: expect.any(String),
      },
    ])
  })

  it('saves the ticked bowler as forced', async () => {
    const cal = { squadId: squadOne.id, registrationId: person(2).registrationId }

    const { commands } = await applied({ bowled: 20 }, { ...moveBody, keepAdvancing: [cal] })

    expect(commands[0]?.keepAdvancing).toEqual([cal])
  })

  it('deletes the registration on a refund of the only squad entry', async () => {
    const { response, commands } = await applied({}, refundBody)

    expect(response.body).toEqual({ deletedRegistration: true })
    expect(commands[0]).toMatchObject({ deleteRegistration: true, targetSquadId: null })
  })

  it('tells the screens of both squads', async () => {
    const { published } = await applied({}, moveBody)

    expect(published.map((message) => message.sessionId)).toEqual(
      expect.arrayContaining([squadOne.id, openSquad.id]),
    )
  })

  it('logs the admin and ids, never a name (NSH-14)', async () => {
    const { captured } = await applied({}, moveBody)

    const line = captured.records().find((each) => each.msg === 'No-show moved')
    expect(line).toMatchObject({
      actorId: expect.any(String),
      registrationId: noShow.registrationId,
      targetSquadId: openSquad.id,
    })
    expect(JSON.stringify(line)).not.toContain('Noshow')
  })

  it('shows the preview again, and saves nothing, when it is out of date', async () => {
    const { app, commands } = world()

    const response = await request(app)
      .post(base())
      .send({ ...moveBody, version: 'stale' })

    expect(response.status).toBe(409)
    expect(response.body.preview.version).not.toBe('stale')
    expect(commands).toEqual([])
  })

  it('shows the preview again when the transaction finds a fact changed', async () => {
    const { response, published } = await applied({ answer: 'changed' }, moveBody)

    expect(response.status).toBe(409)
    expect(response.body.preview).toBeDefined()
    expect(published).toEqual([])
  })
})
