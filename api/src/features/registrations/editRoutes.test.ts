import { faker } from '@faker-js/faker'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import {
  createDivision,
  createSweeper,
  createTournament,
  testApiKey,
} from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { createInMemoryRegistrationWriter, type StoredSession } from './writer.ts'

const session = (kind: 'squad' | 'sweeper', tournamentId: string): StoredSession => ({
  id: faker.string.uuid(),
  tournamentId,
  kind,
  complete: false,
})

/** One registered bowler holding squad 0 and sweeper 0, with a second squad free to add. */
function world(
  options: { completed?: boolean; scored?: 'squad' | 'sweeper'; scoredElsewhere?: boolean } = {},
) {
  const tournament = createTournament({ startDate: '2026-10-23' })
  const division = createDivision({ name: 'Scratch' })
  const squads = [session('squad', tournament.id), session('squad', tournament.id)]
  const sweepers = [session('sweeper', tournament.id), session('sweeper', tournament.id)]
  const bowler = createCommonBowler()
  const registrationId = faker.string.uuid()
  const elsewhere = session('squad', faker.string.uuid())
  const { writer, state } = createInMemoryRegistrationWriter({
    bowlers: [bowler],
    divisions: [{ id: division.id, tournamentId: tournament.id }],
    registrations: [
      {
        tournamentId: tournament.id,
        registration: {
          id: registrationId,
          bowlerId: bowler.id,
          divisionId: division.id,
          average: 180,
          superSweeper: false,
          sessionIds: [squads[0]?.id ?? '', sweepers[0]?.id ?? ''],
        },
      },
    ],
    sessions: [...squads, ...sweepers, elsewhere],
    scores: [
      ...(options.scored
        ? [
            {
              bowlerId: bowler.id,
              sessionId: (options.scored === 'squad' ? squads[0] : sweepers[0])?.id ?? '',
            },
          ]
        : []),
      ...(options.scoredElsewhere ? [{ bowlerId: bowler.id, sessionId: elsewhere.id }] : []),
    ],
  })
  const overrides = {
    tournaments: createInMemoryTournamentRepository(
      [tournament],
      {},
      {
        [tournament.id]: {
          games: 5,
          finalsRatio: 8,
          cashRatio: 5,
          superSweeperCashRatio: 8,
          completed: options.completed ?? false,
        },
      },
    ),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
    sweepers: createInMemorySweeperRepository(
      sweepers.map((s) => ({ tournamentId: tournament.id, sweeper: createSweeper({ id: s.id }) })),
    ),
    registrationWriter: writer,
  }
  const url = `/v1/tournaments/${tournament.id}/registrations/${registrationId}`
  return { overrides, url, state, tournament, division, squads, sweepers, bowler, registrationId }
}

describe('GET /v1/tournaments/{id}/registrations/{registrationId}/edit-info (D-197)', () => {
  it('returns the bowler, the registration, and the locks (REG-15, BWL-17)', async () => {
    const { overrides, url, bowler, division, squads, sweepers, registrationId } = world()

    const response = await request(createSignedInTestApp(overrides)).get(`${url}/edit-info`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      bowler: expect.objectContaining({
        id: bowler.id,
        firstName: 'Joseph',
        phoneNumber: '9195550101',
        dateOfBirth: '1960-05-05',
        gender: 'Female',
      }),
      registration: {
        id: registrationId,
        divisionId: division.id,
        average: 180,
        superSweeper: false,
        squadIds: [squads[0]?.id],
        sweeperIds: [sweepers[0]?.id],
      },
      locks: { scoredSessionIds: [], hasScores: false, hasSweeperScores: false },
    })
    expect(JSON.stringify(response.body)).not.toMatch(/social|ssn/i)
  })

  it('names the sessions where the bowler has scores (REG-34)', async () => {
    const { overrides, url, squads } = world({ scored: 'squad' })

    const response = await request(createSignedInTestApp(overrides)).get(`${url}/edit-info`)

    expect(response.body).toMatchObject({
      locks: { scoredSessionIds: [squads[0]?.id], hasScores: true, hasSweeperScores: false },
    })
  })

  it('does not count a score from another tournament (REG-15)', async () => {
    const { overrides, url } = world({ scoredElsewhere: true })

    const response = await request(createSignedInTestApp(overrides)).get(`${url}/edit-info`)

    expect(response.body).toMatchObject({
      locks: { scoredSessionIds: [], hasScores: false, hasSweeperScores: false },
    })
  })

  it('flags a sweeper score (REG-18, D-110)', async () => {
    const { overrides, url } = world({ scored: 'sweeper' })

    const response = await request(createSignedInTestApp(overrides)).get(`${url}/edit-info`)

    expect(response.body).toMatchObject({ locks: { hasScores: true, hasSweeperScores: true } })
  })

  it('answers 404 for an unknown tournament or registration, and 400 for a bad id', async () => {
    const { overrides, url, tournament } = world()
    const app = createSignedInTestApp(overrides)

    const registration = await request(app).get(
      `/v1/tournaments/${tournament.id}/registrations/${faker.string.uuid()}/edit-info`,
    )
    const unknown = await request(app).get(
      `/v1/tournaments/${faker.string.uuid()}/registrations/${faker.string.uuid()}/edit-info`,
    )
    const other = await request(app).get(
      `/v1/tournaments/${faker.string.uuid()}/registrations/${url.split('/').pop()}/edit-info`,
    )
    const bad = await request(app).get(
      `/v1/tournaments/${tournament.id}/registrations/nope/edit-info`,
    )

    expect(registration.status).toBe(404)
    expect(registration.body).toEqual({ message: 'Registration not found' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Tournament not found' })
    expect(other.status).toBe(404)
    expect(bad.status).toBe(400)
  })
})

describe('PATCH /v1/tournaments/{id}/registrations/{registrationId} (D-197)', () => {
  it('saves the change: 200 with the counts (REG-21, REG-20)', async () => {
    const { overrides, url, state, squads, registrationId } = world()

    const response = await request(createSignedInTestApp(overrides))
      .patch(url)
      .send({ addSquadIds: [squads[1]?.id], bowler: { phoneNumber: '' } })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ registrationId, added: 1, removed: 0 })
    expect(state.registrations[0]?.registration.sessionIds).toContain(squads[1]?.id)
    expect(state.bowlers[0]?.phoneNumber).toBe('')
  })

  it('answers 400 with a message per field and saves nothing (REG-03, REG-20)', async () => {
    const { overrides, url, state, squads, sweepers } = world({ scored: 'squad' })

    const response = await request(createSignedInTestApp(overrides))
      .patch(url)
      .send({
        removeSquadIds: [squads[0]?.id],
        removeSweeperIds: [sweepers[0]?.id],
        bowler: { firstName: '', email: 'bad' },
      })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Bowler has already bowled in removed squads.',
      errors: {
        'bowler.firstName': 'First Name is Required',
        'bowler.email': 'Invalid Email',
        squadIds: 'Bowler has already bowled in removed squads.',
      },
    })
    expect(state.registrations[0]?.registration.sessionIds).toHaveLength(2)
  })

  it.each([
    ['a sweeper with scores', 'sweeper', 'removeSweeperIds', 'sweeperIds'],
    ['a squad with scores', 'squad', 'removeSquadIds', 'squadIds'],
  ] as const)('puts the refusal for %s under its own field', async (_name, scored, key, field) => {
    const { overrides, url, squads, sweepers } = world({ scored })
    const ids = scored === 'squad' ? squads : sweepers

    const response = await request(createSignedInTestApp(overrides))
      .patch(url)
      .send({ [key]: [ids[0]?.id], ...(scored === 'sweeper' ? { superSweeper: false } : {}) })

    expect(response.status).toBe(400)
    expect(Object.keys(response.body.errors as object)).toContain(field)
  })

  it('puts the super sweeper refusals under superSweeper', async () => {
    const { overrides, url } = world()

    const response = await request(createSignedInTestApp(overrides))
      .patch(url)
      .send({ superSweeper: true })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Super Sweeper cannot be enrolled when not all sweepers are registered.',
      errors: {
        superSweeper: 'Super Sweeper cannot be enrolled when not all sweepers are registered.',
      },
    })
  })

  it('answers 400 for a body that fails the schema, with the path of each field', async () => {
    const { overrides, url } = world()

    const response = await request(createSignedInTestApp(overrides))
      .patch(url)
      .send({ average: 301, bowler: { state: 'NCX' } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Average must be less than or equal to 300.',
      errors: {
        average: 'Average must be less than or equal to 300.',
        'bowler.state': 'State must be Postal Abbreviation',
      },
    })
  })

  it('answers 400 for text that is not JSON', async () => {
    const { overrides, url } = world()

    const response = await request(createSignedInTestApp(overrides))
      .patch(url)
      .set('Content-Type', 'application/json')
      .send('{nope')

    expect(response.status).toBe(400)
  })

  it('answers 409 changed with the current registration (D-199)', async () => {
    const { overrides, url, squads, sweepers, registrationId } = world()

    const response = await request(createSignedInTestApp(overrides))
      .patch(url)
      .send({ addSquadIds: [squads[0]?.id] })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      message: 'This registration changed. Review and save again.',
      conflict: 'changed',
      existing: {
        registrationId,
        squadIds: [squads[0]?.id],
        sweeperIds: [sweepers[0]?.id],
        divisionName: 'Scratch',
      },
    })
  })

  it('answers 409 with warnings for an average after scores, then saves on confirm (D-201)', async () => {
    const { overrides, url, state } = world({ scored: 'squad' })
    const app = createSignedInTestApp(overrides)

    const asked = await request(app).patch(url).send({ average: 175 })
    const saved = await request(app).patch(url).send({ average: 175, confirmWarnings: true })

    expect(asked.status).toBe(409)
    expect(asked.body).toEqual({
      message: 'Confirm these changes to save them.',
      warnings: [
        { field: 'average', message: 'This bowler has scores. Handicap and results will change.' },
      ],
    })
    expect(saved.status).toBe(200)
    expect(state.registrations[0]?.registration.average).toBe(175)
  })

  it('answers 409 for a complete tournament (D-130)', async () => {
    const { overrides, url, squads } = world({ completed: true })

    const response = await request(createSignedInTestApp(overrides))
      .patch(url)
      .send({ addSquadIds: [squads[1]?.id] })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'This tournament is complete.',
      errors: { form: 'This tournament is complete.' },
    })
  })

  it('answers 404 for an unknown tournament or registration', async () => {
    const { overrides, tournament } = world()
    const app = createSignedInTestApp(overrides)

    const registration = await request(app)
      .patch(`/v1/tournaments/${tournament.id}/registrations/${faker.string.uuid()}`)
      .send({})
    const unknown = await request(app)
      .patch(`/v1/tournaments/${faker.string.uuid()}/registrations/${faker.string.uuid()}`)
      .send({})

    expect(registration.status).toBe(404)
    expect(registration.body).toEqual({ message: 'Registration not found' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Tournament not found' })
  })

  it('logs who edited, which registration, and the counts, and no personal data (api-observability)', async () => {
    const captured = createCapturedLogger()
    const { overrides, url, tournament, squads, registrationId } = world()

    await request(createSignedInTestApp({ ...overrides, logger: captured.logger }))
      .patch(url)
      .send({ addSquadIds: [squads[1]?.id], bowler: { email: 'zelda@example.com' } })

    const line = captured.records().find((record) => record['msg'] === 'Registration edited')
    expect(line).toMatchObject({
      tournamentId: tournament.id,
      registrationId,
      added: 1,
      removed: 0,
    })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toMatch(/zelda|Joseph|Fontaine|1234-56789/)
  })

  it('logs who read the details for an edit, by bowler id only', async () => {
    const captured = createCapturedLogger()
    const { overrides, url, bowler } = world()

    await request(createSignedInTestApp({ ...overrides, logger: captured.logger })).get(
      `${url}/edit-info`,
    )

    const line = captured
      .records()
      .find((record) => record['msg'] === 'Registration read for edit at the desk')
    expect(line).toMatchObject({ bowlerId: bowler.id })
    expect(JSON.stringify(line)).not.toMatch(/Joseph|Fontaine|old@example/)
  })
})

describe('who may call it (EDR-04, D-198, D-96)', () => {
  const calls = [
    ['GET edit-info', (url: string) => request(createTestApp()).get(`${url}/edit-info`)],
    ['PATCH', (url: string) => request(createTestApp()).patch(url).send({})],
  ] as const

  it.each(calls)('answers 401 to %s when signed out', async (_name, call) => {
    const { url } = world()

    expect((await call(url)).status).toBe(401)
  })

  it('answers 403 to the API key, which reaches the vendor routes only', async () => {
    const { overrides, url } = world()
    const app = createTestApp(overrides)

    const read = await request(app).get(`${url}/edit-info`).set(apiKeyHeader, testApiKey)
    const write = await request(app).patch(url).set(apiKeyHeader, testApiKey).send({})

    expect(read.status).toBe(403)
    expect(write.status).toBe(403)
  })

  it('answers 403 to a score keeper', async () => {
    const { overrides, url } = world()
    const app = createSignedInTestApp(overrides, 'scoreKeeper')

    expect((await request(app).get(`${url}/edit-info`)).status).toBe(403)
    expect((await request(app).patch(url).send({})).status).toBe(403)
  })

  it.each(['director', 'admin'] as const)('lets a %s read and edit', async (role) => {
    const { overrides, url } = world()
    const app = createSignedInTestApp(overrides, role)

    expect((await request(app).get(`${url}/edit-info`)).status).toBe(200)
    expect((await request(app).patch(url).send({})).status).toBe(200)
  })
})
