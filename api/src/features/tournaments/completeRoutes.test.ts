import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createNewTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { recordingEvents } from '../../test/recordingEvents.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import {
  createInMemoryTournamentWriter,
  type TournamentCompleteInfo,
  type TournamentWriter,
} from './writer.ts'

// A fixed id: the test names carry it, and Stryker matches tests across processes by name.
const tournament = {
  id: '11111111-1111-4111-8111-111111111111',
  ...createNewTournament({ name: 'Spring Classic' }),
}
const missingId = '66666666-6666-4666-8666-666666666666'
const url = `/v1/tournaments/${tournament.id}/complete`
const infoUrl = `/v1/tournaments/${tournament.id}/complete-info`

function setup(
  options: {
    facts?: Partial<TournamentCompleteInfo>
    completed?: boolean
    unreadable?: boolean
  } = {},
) {
  const made = createInMemoryTournamentWriter([{ ...tournament }], {
    completeFacts: { [tournament.id]: options.facts ?? {} },
    completed: options.completed ? [tournament.id] : [],
    unreadable: options.unreadable ? [tournament.id] : [],
  })
  return { ...made, app: createSignedInTestApp({ tournamentWriter: made.writer }) }
}

const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
const brokenWriter: TournamentWriter = {
  ...createInMemoryTournamentWriter().writer,
  complete: outage,
  getCompleteInfo: outage,
}

describe(`POST ${url}`, () => {
  it('completes the tournament and answers the counts it closed (TRN-38, D-256)', async () => {
    const { app, completedIds } = setup({
      facts: { openSquadCount: 3, openSweeperCount: 1, noScoreCount: 7 },
    })

    const response = await request(app).post(url)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      completed: true,
      squadsCompleted: 3,
      sweepersCompleted: 1,
      noShowCount: 7,
    })
    expect(completedIds.has(tournament.id)).toBe(true)
  })

  it('completes when nothing is open and answers zero counts (TRN-39, D-257)', async () => {
    const { app } = setup({ facts: { squadCount: 2, openSquadCount: 0 } })

    const response = await request(app).post(url)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      completed: true,
      squadsCompleted: 0,
      sweepersCompleted: 0,
      noShowCount: 0,
    })
  })

  it('refuses a second complete with 409 and changes nothing (TRN-39, D-257)', async () => {
    const { app } = setup()
    await request(app).post(url)

    const response = await request(app).post(url)

    const message = 'This tournament is already complete'
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { tournament: message } })
  })

  it('refuses a tournament with no squad (TRN-39, D-257)', async () => {
    const { app, completedIds } = setup({ facts: { squadCount: 0, openSquadCount: 0 } })

    const response = await request(app).post(url)

    const message = 'Add a squad before you complete this tournament'
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { tournament: message } })
    expect(completedIds.has(tournament.id)).toBe(false)
  })

  it('sends the first reason as the message and every reason in errors (TRN-39)', async () => {
    const { app } = setup({ completed: true, facts: { squadCount: 0 } })

    const response = await request(app).post(url)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'This tournament is already complete',
      errors: {
        tournament:
          'This tournament is already complete\nAdd a squad before you complete this tournament',
      },
    })
  })

  it('refuses a stored session the app cannot read with errors.session (TRN-39, D-257)', async () => {
    const { app, completedIds } = setup({ unreadable: true })

    const response = await request(app).post(url)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errors: { session: expect.any(String) as string } })
    expect(completedIds.has(tournament.id)).toBe(false)
  })

  it('answers 400 for an id that is not a UUID and 404 for an unknown tournament (TRN-38)', async () => {
    const { app } = setup()

    expect((await request(app).post('/v1/tournaments/nope/complete')).status).toBe(400)
    const unknown = await request(app).post(`/v1/tournaments/${missingId}/complete`)
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Tournament not found' })
  })

  it('logs who completed which tournament, in counts and no name (TRN-38, D-256)', async () => {
    const { logger, records } = createCapturedLogger()
    const { writer } = setup({
      facts: { openSquadCount: 2, openSweeperCount: 1, noScoreCount: 4 },
    })
    const app = createSignedInTestApp({ tournamentWriter: writer, logger })

    await request(app).post(url)

    const line = records().find((record) => record['msg'] === 'Tournament completed')
    expect(line).toMatchObject({
      tournamentId: tournament.id,
      squadsCompleted: 2,
      sweepersCompleted: 1,
      noShowCount: 4,
    })
    expect(typeof line?.['actorId']).toBe('string')
    expect(JSON.stringify(line)).not.toContain('Spring Classic')
  })

  it('logs a refusal with the ids and the number of reasons (TRN-39)', async () => {
    const { logger, records } = createCapturedLogger()
    const { writer } = setup({ completed: true })
    const app = createSignedInTestApp({ tournamentWriter: writer, logger })

    await request(app).post(url)

    const line = records().find((record) => record['msg'] === 'Tournament complete refused')
    expect(line).toMatchObject({ tournamentId: tournament.id, reasons: 1 })
    expect(records().find((record) => record['msg'] === 'Tournament completed')).toBeUndefined()
  })

  it('counts every reason in the refusal log, not every key (TRN-39)', async () => {
    const { logger, records } = createCapturedLogger()
    const { writer } = setup({ completed: true, facts: { squadCount: 0 } })
    const app = createSignedInTestApp({ tournamentWriter: writer, logger })

    await request(app).post(url)

    const line = records().find((record) => record['msg'] === 'Tournament complete refused')
    expect(line).toMatchObject({ reasons: 2 })
  })

  it('names the tournament refusal before an unreadable session (TRN-39, D-257)', async () => {
    const { app } = setup({ completed: true, unreadable: true })

    const response = await request(app).post(url)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      errors: { tournament: expect.any(String) as string },
    })
    expect((response.body as { errors: object }).errors).not.toHaveProperty('session')
  })

  it('passes a storage outage on as 503', async () => {
    const response = await request(createSignedInTestApp({ tournamentWriter: brokenWriter })).post(
      url,
    )

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (D-256, D-96)', () => {
    it('answers 401 when signed out', async () => {
      expect((await request(createTestApp()).post(url)).status).toBe(401)
    })

    it('answers 403 to the API key and to a score keeper', async () => {
      const key = await request(createTestApp()).post(url).set(apiKeyHeader, testApiKey)
      const keeper = await request(createSignedInTestApp({}, 'scoreKeeper')).post(url)

      expect(key.status).toBe(403)
      expect(keeper.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s complete', async (role) => {
      const { writer } = setup()
      const app = createSignedInTestApp({ tournamentWriter: writer }, role)

      expect((await request(app).post(url)).status).toBe(200)
    })
  })
})

describe(`GET ${infoUrl}`, () => {
  it('answers the counts the dialog shows (TRN-41, D-259)', async () => {
    const facts = {
      squadCount: 4,
      openSquadCount: 2,
      openSweeperCount: 1,
      noScoreCount: 4,
      partialCount: 2,
    }

    const response = await request(setup({ facts }).app).get(infoUrl)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ completeInfo: facts })
  })

  it('answers 400 for a bad id and 404 for an unknown tournament (TRN-41)', async () => {
    const { app } = setup()

    expect((await request(app).get('/v1/tournaments/nope/complete-info')).status).toBe(400)
    const unknown = await request(app).get(`/v1/tournaments/${missingId}/complete-info`)
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Tournament not found' })
  })

  it('passes a storage outage on as 503', async () => {
    const app = createSignedInTestApp({ tournamentWriter: brokenWriter })

    expect((await request(app).get(infoUrl)).status).toBe(503)
  })

  it('needs sign-in and tournaments.write: 401, and 403 for the API key and a score keeper', async () => {
    expect((await request(createTestApp()).get(infoUrl)).status).toBe(401)
    expect((await request(createTestApp()).get(infoUrl).set(apiKeyHeader, testApiKey)).status).toBe(
      403,
    )
    expect((await request(createSignedInTestApp({}, 'scoreKeeper')).get(infoUrl)).status).toBe(403)
  })
})

describe('live updates after Complete (LAN-22, D-10, D-219)', () => {
  it('tells the pages of each closed session once, and says nothing for a refusal', async () => {
    const { events, published } = recordingEvents()
    const { writer } = setup({ facts: { openSquadCount: 2, openSweeperCount: 1 } })
    const app = createSignedInTestApp({ tournamentWriter: writer, events })

    const first = await request(app).post(url)
    const second = await request(app).post(url)

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    // Per closed session: its lane pages, then the TV page's stream (RES-49).
    expect(published.filter((message) => message.kind === 'lanes')).toHaveLength(3)
    expect(published.filter((message) => message.kind === 'complete')).toHaveLength(3)
    expect(
      published.every(
        (message) => message.kind !== 'complete' || message.sessionId === `live:${tournament.id}`,
      ),
    ).toBe(true)
  })

  it('says nothing when no session was open', async () => {
    const { events, published } = recordingEvents()
    const { writer } = setup({ facts: { openSquadCount: 0, squadCount: 1 } })

    await request(createSignedInTestApp({ tournamentWriter: writer, events })).post(url)

    expect(published).toEqual([])
  })
})
