import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { completeMessage, duplicateNameMessage, unusualPercentMessage } from './createPlan.ts'
import { createInMemoryDivisionWriter, type DivisionWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const url = `/v1/tournaments/${tournamentId}/divisions`

const body = {
  name: 'Seniors 50+',
  gender: 'Female',
  minimumAge: 50,
  maximumAge: null,
  minimumAverage: null,
  maximumAverage: 220,
  handicapPercentage: 90,
  handicapBase: 220,
  maximumHandicapPerGame: 40,
}

describe(`POST ${url}`, () => {
  it('creates a division, answers 201 with Location and every field the list shows (DIV-12)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter()
    const app = createSignedInTestApp({ divisionWriter: writer })

    const response = await request(app).post(url).send(body)

    expect(response.status).toBe(201)
    const division = (response.body as { division: { id: string } }).division
    expect(response.headers['location']).toBe(url)
    expect(response.body).toEqual({ division: { id: division.id, number: 1, ...body } })
    expect(stored.map((entry) => entry.division)).toEqual([division])
    expect(stored[0]?.tournamentId).toBe(tournamentId)
  })

  it('stores a name alone with every limit not set (DIV-12)', async () => {
    const response = await request(createSignedInTestApp()).post(url).send({ name: 'Open' })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      division: {
        name: 'Open',
        gender: null,
        minimumAge: null,
        handicapPercentage: null,
        handicapBase: null,
        maximumHandicapPerGame: null,
      },
    })
  })

  it('gives each new division the next number and ignores one the client sends (DIV-01, D-139)', async () => {
    const app = createSignedInTestApp()

    const first = await request(app).post(url).send({ name: 'Open', number: 40 })
    const second = await request(app).post(url).send({ name: 'Women' })

    expect(first.body).toMatchObject({ division: { number: 1 } })
    expect(second.body).toMatchObject({ division: { number: 2 } })
  })

  it('trims the name it stores (DIV-02)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter()
    const app = createSignedInTestApp({ divisionWriter: writer })

    await request(app).post(url).send({ name: '  Open ' })

    expect(stored[0]?.division.name).toBe('Open')
  })

  it('logs who created it, the tournament, and the division, and nothing else (D-145)', async () => {
    const captured = createCapturedLogger()
    const app = createSignedInTestApp({ logger: captured.logger })

    const response = await request(app).post(url).send(body)

    const line = captured.records().find((record) => record['msg'] === 'Division created')
    expect(line).toMatchObject({
      tournamentId,
      divisionId: (response.body as { division: { id: string } }).division.id,
    })
    expect(line?.['actorId']).toEqual(expect.any(String))
    expect(JSON.stringify(line)).not.toContain('Seniors')
  })

  it('answers 400 with a message per field and stores nothing (DIV-02, DIV-05, DIV-09, DIV-11)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter()
    const app = createSignedInTestApp({ divisionWriter: writer })

    const response = await request(app)
      .post(url)
      .send({ name: '', minimumAge: 60, maximumAge: 40, handicapPercentage: 90 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Check the highlighted fields. Name is required',
      errors: {
        name: 'Name is required',
        minimumAge: 'Minimum age must be less than or equal to maximum age',
        handicapBase: 'Handicap base is required with a handicap percentage',
      },
    })
    expect(stored).toEqual([])
  })

  it('answers 400 for a body that is not JSON', async () => {
    const response = await request(createSignedInTestApp())
      .post(url)
      .set('content-type', 'application/json')
      .send('{not json')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
  })

  it('answers 400 for a missing body', async () => {
    const response = await request(createSignedInTestApp()).post(url)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ message: 'Send the division as a JSON object.' })
  })

  it('answers 400 for a tournament id that is not a UUID (DIV-03)', async () => {
    const response = await request(createSignedInTestApp())
      .post('/v1/tournaments/not-a-uuid/divisions')
      .send(body)

    expect(response.status).toBe(400)
  })

  it('answers 404 for an unknown tournament (DIV-03)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter({ known: [] })

    const response = await request(createSignedInTestApp({ divisionWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Tournament not found' })
    expect(stored).toEqual([])
  })

  it('answers 409 for a complete tournament and stores nothing (D-143)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter({ completed: [tournamentId] })

    const response = await request(createSignedInTestApp({ divisionWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: completeMessage,
      errors: { tournament: completeMessage },
    })
    expect(stored).toEqual([])
  })

  it('answers 409 for a name already used, ignoring case (DIV-02, D-140)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter()
    const app = createSignedInTestApp({ divisionWriter: writer })
    await request(app).post(url).send({ name: 'Open' })

    const response = await request(app).post(url).send({ name: ' oPEN' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: duplicateNameMessage,
      errors: { name: duplicateNameMessage },
    })
    expect(stored).toHaveLength(1)
  })

  it('accepts the same name in another tournament (D-140)', async () => {
    const app = createSignedInTestApp()
    await request(app).post(url).send({ name: 'Open' })

    const response = await request(app)
      .post('/v1/tournaments/22222222-2222-4222-8222-222222222222/divisions')
      .send({ name: 'Open' })

    expect(response.status).toBe(201)
  })

  it('answers 409 with a warning for a percent over 100 and stores nothing (DIV-08, D-142)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter()
    const app = createSignedInTestApp({ divisionWriter: writer })

    const response = await request(app)
      .post(url)
      .send({ ...body, handicapPercentage: 110 })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'Confirm to add this division.',
      warnings: [{ field: 'handicapPercentage', message: unusualPercentMessage }],
    })
    expect(stored).toEqual([])
  })

  it('stores a percent over 100 when confirmWarnings is true (DIV-08, D-142)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter()
    const app = createSignedInTestApp({ divisionWriter: writer })

    const response = await request(app)
      .post(url)
      .send({ ...body, handicapPercentage: 110, confirmWarnings: true })

    expect(response.status).toBe(201)
    expect(stored[0]?.division.handicapPercentage).toBe(110)
  })

  it('does not warn about a percent of exactly 100 (DIV-08, D-142)', async () => {
    const response = await request(createSignedInTestApp())
      .post(url)
      .send({ ...body, handicapPercentage: 100 })

    expect(response.status).toBe(201)
  })

  it('passes a storage outage on as 503 (DIV-12)', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: DivisionWriter = {
      create: outage,
      update: outage,
      getEditInfo: outage,
      remove: outage,
      getDeleteInfo: outage,
    }

    const response = await request(createSignedInTestApp({ divisionWriter: writer }))
      .post(url)
      .send(body)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (DIV-12, D-96, D-97, D-138)', () => {
    it('answers 401 when signed out, before it reads the body', async () => {
      const response = await request(createTestApp()).post(url).send({})

      expect(response.status).toBe(401)
    })

    it('answers 403 to the API key', async () => {
      const response = await request(createTestApp())
        .post(url)
        .set(apiKeyHeader, testApiKey)
        .send(body)

      expect(response.status).toBe(403)
    })

    it('answers 403 to a score keeper', async () => {
      const response = await request(createSignedInTestApp({}, 'scoreKeeper')).post(url).send(body)

      expect(response.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s create', async (role) => {
      const response = await request(createSignedInTestApp({}, role)).post(url).send(body)

      expect(response.status).toBe(201)
    })

    it('leaves GET of the divisions public (DIV-12, D-09)', async () => {
      const response = await request(createTestApp()).get(url)

      // No stored tournament here, so the list answers its own 404, not a sign-in demand.
      expect(response.status).toBe(404)
    })
  })
})
