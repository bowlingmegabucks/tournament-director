import { faker } from '@faker-js/faker'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createDivision, testApiKey } from '../../test/factories.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createCommonBowler } from '../registrations/bowler.testData.ts'
import { createInMemoryRegistrationWriter } from '../registrations/writer.ts'
import { createInMemoryBowlerRepository, type InMemoryBowler } from './repository.ts'
import { needFilterMessage } from './routes.ts'
import { bowlerResponseSchema, bowlerSearchSchema, searchLimit } from './types.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'

function searchable(overrides: Partial<InMemoryBowler> = {}): InMemoryBowler {
  return {
    id: faker.string.uuid(),
    firstName: 'Maria',
    lastName: 'Gonzalez',
    suffix: '',
    email: 'maria@example.com',
    usbcId: '1234-56789',
    city: 'Worcester',
    state: 'MA',
    ...overrides,
  }
}

describe('GET /v1/bowlers (BWL-14, D-157)', () => {
  it('finds by last name prefix and first name prefix, ignoring case, with the contract shape', async () => {
    const maria = searchable()
    const mario = searchable({ firstName: 'Mario', lastName: 'Gonzalez', usbcId: '' })
    const other = searchable({ firstName: 'Paul', lastName: 'Gonzalez' })
    const app = createSignedInTestApp({
      bowlers: createInMemoryBowlerRepository([other, mario, maria]),
    })

    const response = await request(app)
      .get('/v1/bowlers')
      .query({ lastName: 'gon', firstName: 'MAR' })

    expect(response.status).toBe(200)
    expect(bowlerSearchSchema.parse(response.body).bowlers.map((b) => b.id)).toEqual([
      maria.id,
      mario.id,
    ])
    const body = bowlerSearchSchema.parse(response.body)
    expect(body.more).toBe(false)
    expect(body.bowlers[0]).toMatchObject({
      name: 'Maria Gonzalez',
      usbcId: '1234-56789',
      city: 'Worcester',
      state: 'MA',
    })
  })

  it('finds by email and by USBC ID, which must match whole (BWL-14)', async () => {
    const maria = searchable()
    const app = createSignedInTestApp({ bowlers: createInMemoryBowlerRepository([maria]) })

    const email = await request(app).get('/v1/bowlers').query({ email: 'MARIA@example.com' })
    const usbc = await request(app).get('/v1/bowlers').query({ usbcId: '1234-56789' })
    const partial = await request(app).get('/v1/bowlers').query({ usbcId: '1234' })

    expect((email.body as { bowlers: unknown[] }).bowlers).toHaveLength(1)
    expect((usbc.body as { bowlers: unknown[] }).bowlers).toHaveLength(1)
    expect((partial.body as { bowlers: unknown[] }).bowlers).toHaveLength(0)
  })

  it('combines filters with AND (BWL-14)', async () => {
    const app = createSignedInTestApp({
      bowlers: createInMemoryBowlerRepository([searchable(), searchable({ firstName: 'Ana' })]),
    })

    const response = await request(app)
      .get('/v1/bowlers')
      .query({ lastName: 'Gon', firstName: 'An' })

    expect(response.body).toMatchObject({ bowlers: [{ firstName: 'Ana' }] })
  })

  it('sorts by last name, first name, then id, and adds the suffix to the name (BWL-13)', async () => {
    const a = searchable({
      id: '00000000-0000-4000-8000-000000000002',
      firstName: 'Zed',
      lastName: 'Abel',
    })
    const b = searchable({
      id: '00000000-0000-4000-8000-000000000001',
      firstName: 'Amy',
      lastName: 'Abel',
      suffix: 'Jr',
    })
    const c = searchable({
      id: '00000000-0000-4000-8000-000000000000',
      firstName: 'Amy',
      lastName: 'Zane',
    })
    const app = createSignedInTestApp({ bowlers: createInMemoryBowlerRepository([c, a, b]) })

    const response = await request(app)
      .get('/v1/bowlers')
      .query({ lastName: '', email: '', usbcId: '1234-56789' })

    expect((response.body as { bowlers: { name: string }[] }).bowlers.map((x) => x.name)).toEqual([
      'Amy Abel, Jr',
      'Zed Abel',
      'Amy Zane',
    ])
  })

  it('marks a bowler registered in the tournament asked about, with the division (REG-01, D-159)', async () => {
    const maria = searchable()
    const mario = searchable({ firstName: 'Mario' })
    const app = createSignedInTestApp({
      bowlers: createInMemoryBowlerRepository(
        [maria, mario],
        [{ tournamentId, bowlerId: maria.id, divisionName: 'Handicap' }],
      ),
    })

    const withTournament = await request(app)
      .get('/v1/bowlers')
      .query({ lastName: 'Gon', tournamentId })
    const without = await request(app).get('/v1/bowlers').query({ lastName: 'Gon' })

    expect(withTournament.body).toMatchObject({
      bowlers: [
        { id: maria.id, registered: { divisionName: 'Handicap' } },
        { id: mario.id, registered: null },
      ],
    })
    expect(
      (without.body as { bowlers: { registered: unknown }[] }).bowlers.every(
        (b) => b.registered === null,
      ),
    ).toBe(true)
  })

  it('cuts the list at 25 and says there is more', async () => {
    const many = Array.from({ length: searchLimit + 1 }, (_, index) =>
      searchable({ firstName: `A${String(index).padStart(2, '0')}` }),
    )
    const app = createSignedInTestApp({ bowlers: createInMemoryBowlerRepository(many) })

    const response = await request(app).get('/v1/bowlers').query({ lastName: 'Gon' })

    const body = bowlerSearchSchema.parse(response.body)
    expect(body.bowlers).toHaveLength(searchLimit)
    expect(body.more).toBe(true)
  })

  it('answers 400 with no search field, and treats blank fields as none (BWL-14)', async () => {
    const app = createSignedInTestApp()

    const none = await request(app).get('/v1/bowlers')
    const blank = await request(app).get('/v1/bowlers').query({ lastName: '  ', email: '' })

    expect(none.status).toBe(400)
    expect(none.body).toEqual({ message: 'Enter at least one search field.' })
    expect(needFilterMessage).toBe('Enter at least one search field.')
    expect(blank.status).toBe(400)
  })

  it('answers 400 for a tournament id that is not a UUID', async () => {
    const response = await request(createSignedInTestApp())
      .get('/v1/bowlers')
      .query({ lastName: 'a', tournamentId: 'nope' })

    expect(response.status).toBe(400)
  })

  it('never sends the SSN, birth date, email, phone, or street (BWL-17)', async () => {
    const app = createSignedInTestApp({ bowlers: createInMemoryBowlerRepository([searchable()]) })

    const response = await request(app).get('/v1/bowlers').query({ lastName: 'Gon' })

    const [bowler] = (response.body as { bowlers: Record<string, unknown>[] }).bowlers
    expect(Object.keys(bowler ?? {}).sort()).toEqual([
      'city',
      'firstName',
      'id',
      'lastName',
      'name',
      'registered',
      'state',
      'usbcId',
    ])
  })

  describe('who may call it (D-157, D-96)', () => {
    it('answers 401 when signed out, and 403 to the API key and to a score keeper', async () => {
      expect(
        (await request(createTestApp()).get('/v1/bowlers').query({ lastName: 'a' })).status,
      ).toBe(401)
      expect(
        (
          await request(createTestApp())
            .get('/v1/bowlers')
            .query({ lastName: 'a' })
            .set(apiKeyHeader, testApiKey)
        ).status,
      ).toBe(403)
      expect(
        (
          await request(createSignedInTestApp({}, 'scoreKeeper'))
            .get('/v1/bowlers')
            .query({ lastName: 'a' })
        ).status,
      ).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s search', async (role) => {
      const response = await request(createSignedInTestApp({}, role))
        .get('/v1/bowlers')
        .query({ lastName: 'a' })

      expect(response.status).toBe(200)
    })
  })
})

describe('GET /v1/bowlers/{id} (D-157, D-158, D-165)', () => {
  function world() {
    const division = createDivision({ name: 'Handicap' })
    const bowler = createCommonBowler({ dateOfBirth: '1984-03-09', gender: 'Female' })
    const squad = { id: faker.string.uuid(), tournamentId, kind: 'squad' as const, complete: false }
    const sweeper = {
      id: faker.string.uuid(),
      tournamentId,
      kind: 'sweeper' as const,
      complete: false,
    }
    const earlier = {
      id: faker.string.uuid(),
      tournamentId: faker.string.uuid(),
      kind: 'squad' as const,
      complete: true,
    }
    const { writer, state } = createInMemoryRegistrationWriter({
      bowlers: [bowler],
      divisions: [{ id: division.id, tournamentId }],
      sessions: [squad, sweeper, earlier],
    })
    const overrides = {
      registrationWriter: writer,
      divisions: createInMemoryDivisionRepository([{ tournamentId, division }]),
    }
    return { overrides, state, bowler, division, squad, sweeper, earlier }
  }

  it('returns the fields the form edits, with an empty registration when none (D-158)', async () => {
    const { overrides, bowler } = world()

    const response = await request(createSignedInTestApp(overrides))
      .get(`/v1/bowlers/${bowler.id}`)
      .query({ tournamentId })

    expect(response.status).toBe(200)
    expect(bowlerResponseSchema.parse(response.body)).toEqual({
      bowler: { ...bowler, dateOfBirth: '1984-03-09', gender: 'Female' },
      registration: null,
    })
  })

  it('writes an unknown birth date and gender as empty text, for the form', async () => {
    const { overrides, bowler, state } = world()
    const stored = state.bowlers[0]
    if (stored) Object.assign(stored, { dateOfBirth: null, gender: null })

    const response = await request(createSignedInTestApp(overrides)).get(`/v1/bowlers/${bowler.id}`)

    expect(response.body).toMatchObject({
      bowler: { dateOfBirth: '', gender: '' },
      registration: null,
    })
  })

  it('never carries an SSN (BWL-17)', async () => {
    const { overrides, bowler } = world()

    const response = await request(createSignedInTestApp(overrides)).get(`/v1/bowlers/${bowler.id}`)

    expect(JSON.stringify(response.body)).not.toMatch(/social|ssn/i)
  })

  it('returns the registration in the tournament asked about: division, squads, sweepers, average (REG-01, D-165)', async () => {
    const { overrides, state, bowler, division, squad, sweeper } = world()
    const registration = {
      id: faker.string.uuid(),
      bowlerId: bowler.id,
      divisionId: division.id,
      average: 182,
      superSweeper: true,
      sessionIds: [squad.id, sweeper.id],
    }
    state.registrations.push({ tournamentId, registration })

    const response = await request(createSignedInTestApp(overrides))
      .get(`/v1/bowlers/${bowler.id}`)
      .query({ tournamentId })
    const elsewhere = await request(createSignedInTestApp(overrides))
      .get(`/v1/bowlers/${bowler.id}`)
      .query({ tournamentId: faker.string.uuid() })

    expect(response.body).toMatchObject({
      registration: {
        id: registration.id,
        divisionId: division.id,
        divisionName: 'Handicap',
        average: 182,
        superSweeper: true,
        squadIds: [squad.id],
        sweeperIds: [sweeper.id],
        hasScores: false,
      },
    })
    expect(elsewhere.body).toMatchObject({ registration: null })
  })

  it('says hasScores only for a score in this tournament (D-160)', async () => {
    const { overrides, state, bowler, division, squad, earlier } = world()
    state.registrations.push({
      tournamentId,
      registration: {
        id: faker.string.uuid(),
        bowlerId: bowler.id,
        divisionId: division.id,
        average: null,
        superSweeper: false,
        sessionIds: [squad.id],
      },
    })
    state.scores.push({ bowlerId: bowler.id, sessionId: earlier.id })
    const app = createSignedInTestApp(overrides)

    const old = await request(app).get(`/v1/bowlers/${bowler.id}`).query({ tournamentId })
    state.scores.push({ bowlerId: bowler.id, sessionId: squad.id })
    const now = await request(app).get(`/v1/bowlers/${bowler.id}`).query({ tournamentId })

    expect(old.body).toMatchObject({ registration: { hasScores: false } })
    expect(now.body).toMatchObject({ registration: { hasScores: true } })
  })

  it('names the right division among several, and leaves the name empty when it is gone', async () => {
    const { overrides, state, bowler, division, squad } = world()
    const other = createDivision({ name: 'Seniors' })
    state.registrations.push({
      tournamentId,
      registration: {
        id: faker.string.uuid(),
        bowlerId: bowler.id,
        divisionId: division.id,
        average: null,
        superSweeper: false,
        sessionIds: [squad.id],
      },
    })
    const withOther = {
      ...overrides,
      divisions: createInMemoryDivisionRepository([
        { tournamentId, division: other },
        { tournamentId, division },
      ]),
    }
    const without = {
      ...overrides,
      divisions: createInMemoryDivisionRepository([{ tournamentId, division: other }]),
    }

    const named = await request(createSignedInTestApp(withOther))
      .get(`/v1/bowlers/${bowler.id}`)
      .query({ tournamentId })
    const gone = await request(createSignedInTestApp(without))
      .get(`/v1/bowlers/${bowler.id}`)
      .query({ tournamentId })

    expect(named.body).toMatchObject({ registration: { divisionName: 'Handicap' } })
    expect(gone.body).toMatchObject({ registration: { divisionName: '' } })
  })

  it('answers 404 for an unknown bowler and 400 for a bad id', async () => {
    const { overrides } = world()
    const app = createSignedInTestApp(overrides)

    const unknown = await request(app).get(`/v1/bowlers/${faker.string.uuid()}`)
    const bad = await request(app).get('/v1/bowlers/nope')

    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Bowler not found' })
    expect(bad.status).toBe(400)
  })

  it('needs bowlers.read like the search (D-157)', async () => {
    const { overrides, bowler } = world()
    const url = `/v1/bowlers/${bowler.id}`

    expect((await request(createTestApp(overrides)).get(url)).status).toBe(401)
    expect((await request(createSignedInTestApp(overrides, 'scoreKeeper')).get(url)).status).toBe(
      403,
    )
    expect(
      (await request(createTestApp(overrides)).get(url).set(apiKeyHeader, testApiKey)).status,
    ).toBe(403)
    expect((await request(createSignedInTestApp(overrides, 'director')).get(url)).status).toBe(200)
  })
})
