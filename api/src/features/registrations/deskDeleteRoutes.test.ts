import { faker } from '@faker-js/faker'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createDivision, createTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { completeMessage, paidMessage, scoresMessage } from './deskDelete.ts'
import { createInMemoryRegistrationWriter, type StoredSession } from './writer.ts'

const session = (
  kind: 'squad' | 'sweeper',
  tournamentId: string,
  date: string,
  entryFee: number,
): StoredSession => ({
  id: faker.string.uuid(),
  tournamentId,
  kind,
  complete: false,
  date,
  entryFee,
})

interface Options {
  completed?: boolean
  scored?: boolean
  scoredElsewhere?: boolean
  payments?: { confirmationCode: string; amount: number }[]
}

/** One registered bowler holding two squads and a sweeper. */
function world(options: Options = {}) {
  const tournament = createTournament({ startDate: '2026-10-23' })
  const division = createDivision({ name: 'Scratch' })
  const squads = [
    session('squad', tournament.id, '2026-10-23T19:00:00', 60),
    session('squad', tournament.id, '2026-10-23T09:00:00', 55),
  ]
  const sweeper = session('sweeper', tournament.id, '2026-10-24T15:00:00', 40)
  const elsewhere = session('squad', faker.string.uuid(), '2026-01-01T09:00:00', 10)
  const bowler = createCommonBowler()
  const registrationId = faker.string.uuid()
  const { writer, state } = createInMemoryRegistrationWriter({
    bowlers: [bowler],
    divisions: [{ id: division.id, tournamentId: tournament.id, name: 'Scratch' }],
    completedTournamentIds: options.completed ? [tournament.id] : [],
    registrations: [
      {
        tournamentId: tournament.id,
        registration: {
          id: registrationId,
          bowlerId: bowler.id,
          divisionId: division.id,
          average: 180,
          superSweeper: false,
          sessionIds: [...squads, sweeper].map((s) => s.id),
        },
      },
    ],
    sessions: [...squads, sweeper, elsewhere],
    payments: (options.payments ?? []).map((payment) => ({ registrationId, ...payment })),
    scores: [
      ...(options.scored ? [{ bowlerId: bowler.id, sessionId: squads[0]?.id ?? '' }] : []),
      ...(options.scoredElsewhere ? [{ bowlerId: bowler.id, sessionId: elsewhere.id }] : []),
    ],
  })
  const overrides = {
    tournaments: createInMemoryTournamentRepository([tournament]),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
    registrationWriter: writer,
  }
  const url = `/v1/tournaments/${tournament.id}/registrations/${registrationId}`
  return { overrides, url, state, tournament, registrationId, bowler }
}

const sitePayment = { confirmationCode: 'BowlingSite_abc123', amount: 160 }

describe('GET …/delete-info (D-212)', () => {
  it('lists each entry with its fee, the totals, and no confirmation code', async () => {
    const { overrides, url } = world({ payments: [sitePayment] })

    const response = await request(createSignedInTestApp(overrides)).get(`${url}/delete-info`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      deleteInfo: {
        bowlerName: 'Joseph Fontaine',
        divisionName: 'Scratch',
        tournamentComplete: false,
        hasScores: false,
        entries: [
          { id: expect.any(String), kind: 'squad', date: '2026-10-23T19:00:00', entryFee: 60 },
          { id: expect.any(String), kind: 'squad', date: '2026-10-23T09:00:00', entryFee: 55 },
          { id: expect.any(String), kind: 'sweeper', date: '2026-10-24T15:00:00', entryFee: 40 },
        ],
        entriesTotal: 155,
        paidTotal: 160,
        payments: [{ system: 'BowlingSite', amount: 160 }],
      },
    })
    expect(JSON.stringify(response.body)).not.toMatch(/abc123|social|ssn/i)
  })

  it('leaves out the desk placeholder and a $0 payment (D-210)', async () => {
    const { overrides, url } = world({
      payments: [
        { confirmationCode: 'Manual_0190', amount: 0 },
        { confirmationCode: 'Site_zero', amount: 0 },
      ],
    })

    const response = await request(createSignedInTestApp(overrides)).get(`${url}/delete-info`)

    expect(response.body).toMatchObject({ deleteInfo: { payments: [], paidTotal: 0 } })
  })

  it('reports scores and a complete tournament (D-211)', async () => {
    const { overrides, url } = world({ scored: true, completed: true })

    const response = await request(createSignedInTestApp(overrides)).get(`${url}/delete-info`)

    expect(response.body).toMatchObject({
      deleteInfo: { hasScores: true, tournamentComplete: true },
    })
  })

  it('does not count a score from another tournament (REG-19)', async () => {
    const { overrides, url } = world({ scoredElsewhere: true })

    const response = await request(createSignedInTestApp(overrides)).get(`${url}/delete-info`)

    expect(response.body).toMatchObject({ deleteInfo: { hasScores: false } })
  })

  it('answers 404 for an unknown tournament or registration, and 400 for a bad id (D-209)', async () => {
    const { overrides, tournament, registrationId } = world()
    const app = createSignedInTestApp(overrides)

    const registration = await request(app).get(
      `/v1/tournaments/${tournament.id}/registrations/${faker.string.uuid()}/delete-info`,
    )
    const unknown = await request(app).get(
      `/v1/tournaments/${faker.string.uuid()}/registrations/${registrationId}/delete-info`,
    )
    const bad = await request(app).get(
      `/v1/tournaments/${tournament.id}/registrations/nope/delete-info`,
    )

    expect(registration.status).toBe(404)
    expect(registration.body).toEqual({ message: 'Registration not found' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Tournament not found' })
    expect(bad.status).toBe(400)
  })
})

describe('DELETE /v1/tournaments/{id}/registrations/{registrationId} (REG-19, D-209 to D-211)', () => {
  it('deletes a registration with no real payment: 204, entries and payments gone, bowler stays', async () => {
    const { overrides, url, state, bowler } = world({
      payments: [{ confirmationCode: 'Manual_0190', amount: 0 }],
    })

    const response = await request(createSignedInTestApp(overrides)).delete(url)

    expect(response.status).toBe(204)
    expect(response.body).toEqual({})
    expect(state.registrations).toEqual([])
    expect(state.payments).toEqual([])
    expect(state.bowlers.map((stored) => stored.id)).toEqual([bowler.id])
  })

  it('warns about a real payment and deletes nothing (D-210)', async () => {
    const { overrides, url, state } = world({ payments: [sitePayment] })

    const response = await request(createSignedInTestApp(overrides)).delete(url)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'Confirm to delete this registration.',
      warnings: [{ field: 'registration', message: paidMessage(160) }],
      paid: 160,
    })
    expect(state.registrations).toHaveLength(1)
    expect(state.payments).toHaveLength(1)
  })

  it('deletes once the confirm carries the total paid (D-210)', async () => {
    const { overrides, url, state } = world({ payments: [sitePayment] })

    const response = await request(createSignedInTestApp(overrides)).delete(
      `${url}?confirmWarnings=true&paid=160.00`,
    )

    expect(response.status).toBe(204)
    expect(state.registrations).toEqual([])
    expect(state.payments).toEqual([])
  })

  it('ignores a total sent without the confirm flag (D-210)', async () => {
    const { overrides, url, state } = world({ payments: [sitePayment] })

    const response = await request(createSignedInTestApp(overrides)).delete(`${url}?paid=160`)

    expect(response.status).toBe(409)
    expect(state.registrations).toHaveLength(1)
  })

  it('warns again with the new total when it moved since the dialog opened (D-210)', async () => {
    const { overrides, url, state } = world({
      payments: [sitePayment, { confirmationCode: 'BowlingSite_def456', amount: 60 }],
    })

    const response = await request(createSignedInTestApp(overrides)).delete(
      `${url}?confirmWarnings=true&paid=160`,
    )

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ paid: 220 })
    expect(state.registrations).toHaveLength(1)
  })

  it('refuses a bowler with scores: 409 with errors.scores, and a confirm cannot override it (REG-19, D-211)', async () => {
    const { overrides, url, state } = world({ scored: true, payments: [sitePayment] })
    const app = createSignedInTestApp(overrides)

    const plain = await request(app).delete(url)
    const confirmed = await request(app).delete(`${url}?confirmWarnings=true&paid=160`)

    for (const response of [plain, confirmed]) {
      expect(response.status).toBe(409)
      expect(response.body).toEqual({
        message: scoresMessage,
        errors: { scores: scoresMessage },
      })
    }
    expect(state.registrations).toHaveLength(1)
  })

  it('refuses a complete tournament, and reports both reasons together (D-211)', async () => {
    const { overrides, url, state } = world({ completed: true, scored: true })

    const response = await request(createSignedInTestApp(overrides)).delete(url)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: completeMessage,
      errors: { tournament: completeMessage, scores: scoresMessage },
    })
    expect(state.registrations).toHaveLength(1)
  })

  it('ignores a score from another tournament (REG-19)', async () => {
    const { overrides, url } = world({ scoredElsewhere: true })

    expect((await request(createSignedInTestApp(overrides)).delete(url)).status).toBe(204)
  })

  it('answers 404 for an unknown or other-tournament registration, and 400 for a bad id or query (D-209)', async () => {
    const { overrides, url, tournament, registrationId } = world()
    const app = createSignedInTestApp(overrides)

    const unknown = await request(app).delete(
      `/v1/tournaments/${tournament.id}/registrations/${faker.string.uuid()}`,
    )
    const otherTournament = await request(app).delete(
      `/v1/tournaments/${faker.string.uuid()}/registrations/${registrationId}`,
    )
    const bad = await request(app).delete(`/v1/tournaments/${tournament.id}/registrations/nope`)
    const noTotal = await request(app).delete(`${url}?confirmWarnings=true`)
    const badTotal = await request(app).delete(`${url}?confirmWarnings=true&paid=abc`)
    const falseFlag = await request(app).delete(`${url}?confirmWarnings=yes&paid=1`)

    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Registration not found' })
    expect(otherTournament.status).toBe(404)
    expect(otherTournament.body).toEqual({ message: 'Tournament not found' })
    expect([bad.status, noTotal.status, badTotal.status, falseFlag.status]).toEqual([
      400, 400, 400, 400,
    ])
  })

  it('does not touch another tournament’s registration through this tournament (D-209)', async () => {
    const mine = world()
    const other = world()
    const app = createSignedInTestApp({ ...mine.overrides })

    const response = await request(app).delete(
      `/v1/tournaments/${mine.tournament.id}/registrations/${other.registrationId}`,
    )

    expect(response.status).toBe(404)
    expect(mine.state.registrations).toHaveLength(1)
  })
})

describe('logging (D-214, api-observability)', () => {
  it('logs the actor, ids, counts, and the paid total, never a name or a code', async () => {
    const captured = createCapturedLogger()
    const { overrides, url, tournament, registrationId } = world({ payments: [sitePayment] })

    await request(createSignedInTestApp({ ...overrides, logger: captured.logger })).delete(
      `${url}?confirmWarnings=true&paid=160`,
    )

    const line = captured
      .records()
      .find((record) => record['msg'] === 'Registration deleted at the desk')
    expect(line).toMatchObject({
      tournamentId: tournament.id,
      registrationId,
      squads: 2,
      sweepers: 1,
      realPayments: 1,
      paidTotal: 160,
    })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toMatch(/Joseph|Fontaine|abc123|BowlingSite|@/)
  })

  it('logs a refusal at warn with the reasons, and the read by id only', async () => {
    const captured = createCapturedLogger()
    const { overrides, url, tournament, registrationId } = world({ scored: true })
    const app = createSignedInTestApp({ ...overrides, logger: captured.logger })

    await request(app).delete(url)
    await request(app).get(`${url}/delete-info`)

    const refusal = captured
      .records()
      .find((record) => record['msg'] === 'Registration delete at the desk refused')
    expect(refusal).toMatchObject({ reasons: ['scores'] })
    const read = captured
      .records()
      .find((record) => record['msg'] === 'Registration read for delete at the desk')
    expect(read).toMatchObject({ tournamentId: tournament.id, registrationId })
    expect(read?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(read)).not.toMatch(/Joseph|Fontaine/)
  })

  it('logs nothing about a delete that only warned', async () => {
    const captured = createCapturedLogger()
    const { overrides, url } = world({ payments: [sitePayment] })

    await request(createSignedInTestApp({ ...overrides, logger: captured.logger })).delete(url)

    expect(
      captured.records().some((record) => record['msg'] === 'Registration deleted at the desk'),
    ).toBe(false)
  })
})

describe('who may call it (D-209, D-198, D-96)', () => {
  const calls = [
    ['GET delete-info', (url: string) => request(createTestApp()).get(`${url}/delete-info`)],
    ['DELETE', (url: string) => request(createTestApp()).delete(url)],
  ] as const

  it.each(calls)('answers 401 to %s when signed out', async (_name, call) => {
    const { url } = world()

    expect((await call(url)).status).toBe(401)
  })

  it('answers 403 to the API key on the desk routes', async () => {
    const { overrides, url, state } = world()
    const app = createTestApp(overrides)

    const read = await request(app).get(`${url}/delete-info`).set(apiKeyHeader, testApiKey)
    const remove = await request(app).delete(url).set(apiKeyHeader, testApiKey)

    expect(read.status).toBe(403)
    expect(remove.status).toBe(403)
    expect(state.registrations).toHaveLength(1)
  })

  it('answers 403 to a score keeper', async () => {
    const { overrides, url, state } = world()
    const app = createSignedInTestApp(overrides, 'scoreKeeper')

    expect((await request(app).get(`${url}/delete-info`)).status).toBe(403)
    expect((await request(app).delete(url)).status).toBe(403)
    expect(state.registrations).toHaveLength(1)
  })

  it.each(['director', 'admin'] as const)('lets a %s read and delete', async (role) => {
    const { overrides, url } = world()
    const app = createSignedInTestApp(overrides, role)

    expect((await request(app).get(`${url}/delete-info`)).status).toBe(200)
    expect((await request(app).delete(url)).status).toBe(204)
  })
})
