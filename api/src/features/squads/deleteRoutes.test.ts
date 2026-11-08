import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { HttpError } from '../../shared/errors.ts'
import { createSquad, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemorySquadWriter, type SquadWriter } from './writer.ts'

const tournamentId = '11111111-1111-4111-8111-111111111111'
const otherTournamentId = '22222222-2222-4222-8222-222222222222'
const sessionId = '33333333-3333-4333-8333-333333333333'
const keptId = '44444444-4444-4444-8444-444444444444'
const url = `/v1/tournaments/${tournamentId}/squads/${sessionId}`
const infoUrl = `${url}/delete-info`

const session = createSquad({ id: sessionId, date: '2026-10-24T09:00:00' })
const kept = createSquad({ id: keptId, date: '2026-10-25T09:00:00' })

function setup(options: Parameters<typeof createInMemorySquadWriter>[0] = {}) {
  const made = createInMemorySquadWriter({
    seed: [
      { tournamentId, squad: { ...session } },
      { tournamentId, squad: { ...kept } },
      {
        tournamentId: otherTournamentId,
        squad: { ...createSquad({ id: '55555555-5555-4555-8555-555555555555' }) },
      },
    ],
    ...options,
  })
  return { ...made, app: createSignedInTestApp({ squadWriter: made.writer }) }
}

const idsOf = (stored: ReturnType<typeof setup>['stored'], id = tournamentId) =>
  stored.filter((entry) => entry.tournamentId === id).map((entry) => entry.squad.id)

describe(`DELETE ${url}`, () => {
  it('deletes the squad and answers 204 with no body (SQD-14, D-189)', async () => {
    const { app, stored } = setup()

    const response = await request(app).delete(url)

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(idsOf(stored)).toEqual([keptId])
  })

  it('deletes the last squad of a tournament too (D-186)', async () => {
    const { app, stored } = setup()

    await request(app).delete(
      `/v1/tournaments/${otherTournamentId}/squads/55555555-5555-4555-8555-555555555555`,
    )

    expect(idsOf(stored, otherTournamentId)).toEqual([])
  })

  it('refuses entered bowlers with 409 and keeps the squad (SQD-14, D-186)', async () => {
    const { app, stored } = setup({ deleteInfo: { [sessionId]: { entryCount: 12 } } })

    const response = await request(app).delete(url)

    const message = '12 bowlers are entered in this squad. Remove them from the squad first.'
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message, errors: { entries: message } })
    expect(idsOf(stored)).toContain(sessionId)
  })

  it('refuses saved scores with 409 (SQD-14, D-186)', async () => {
    const { app, stored } = setup({ deleteInfo: { [sessionId]: { scoreCount: 5 } } })

    const response = await request(app).delete(url)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      errors: { scores: 'Scores are saved for this squad, so it cannot be deleted.' },
    })
    expect(idsOf(stored)).toContain(sessionId)
  })

  it('refuses a complete squad (SQD-17, SQD-18, D-10)', async () => {
    const { app, stored } = setup({
      seed: [{ tournamentId, squad: { ...session, complete: true } }],
    })

    const response = await request(app).delete(url)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      message: 'This squad is complete and cannot be deleted.',
      errors: { session: 'This squad is complete and cannot be deleted.' },
    })
    expect(idsOf(stored)).toEqual([sessionId])
  })

  it('refuses a complete tournament even when nothing depends on the squad (D-130)', async () => {
    const { app, stored } = setup({ completed: [tournamentId] })

    const response = await request(app).delete(url)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      errors: { tournament: 'This tournament is complete and cannot be changed' },
    })
    expect(idsOf(stored)).toContain(sessionId)
  })

  it('lists every reason and puts the tournament first in the message (D-186)', async () => {
    const { app } = setup({
      completed: [tournamentId],
      deleteInfo: { [sessionId]: { entryCount: 1, scoreCount: 1 } },
    })

    const response = await request(app).delete(url)

    expect(response.body).toMatchObject({
      message: 'This tournament is complete and cannot be changed',
    })
    expect(Object.keys((response.body as { errors: object }).errors)).toEqual([
      'tournament',
      'entries',
      'scores',
    ])
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const { app } = setup()

    expect((await request(app).delete(`/v1/tournaments/${tournamentId}/squads/nope`)).status).toBe(
      400,
    )
    expect((await request(app).delete(`/v1/tournaments/nope/squads/${sessionId}`)).status).toBe(400)
  })

  it("answers 404 for an unknown tournament, an unknown squad, or another tournament's squad (SQD-14)", async () => {
    const { app, stored } = setup({ known: [tournamentId, otherTournamentId] })

    const unknownTournament = await request(app).delete(
      `/v1/tournaments/66666666-6666-4666-8666-666666666666/squads/${sessionId}`,
    )
    const unknown = await request(app).delete(
      `/v1/tournaments/${tournamentId}/squads/66666666-6666-4666-8666-666666666666`,
    )
    const elsewhere = await request(app).delete(
      `/v1/tournaments/${otherTournamentId}/squads/${sessionId}`,
    )

    expect(unknownTournament.status).toBe(404)
    expect(unknownTournament.body).toEqual({ message: 'Tournament not found' })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Squad not found' })
    expect(elsewhere.status).toBe(404)
    expect(idsOf(stored)).toContain(sessionId)
  })

  it('logs who deleted which squad, and no date (D-189)', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createSignedInTestApp({ squadWriter: setup().writer, logger })

    await request(app).delete(url)

    const line = records().find((record) => record['msg'] === 'Squad deleted')
    expect(line).toMatchObject({ tournamentId, squadId: sessionId })
    expect(typeof line?.['actorId']).toBe('string')
    expect(JSON.stringify(line)).not.toContain('2026-10-24')
  })

  it('logs a refusal with the ids and the number of reasons (D-189)', async () => {
    const { logger, records } = createCapturedLogger()
    const { writer } = setup({ deleteInfo: { [sessionId]: { entryCount: 1, scoreCount: 1 } } })
    const app = createSignedInTestApp({ squadWriter: writer, logger })

    await request(app).delete(url)

    const line = records().find((record) => record['msg'] === 'Squad delete refused')
    expect(line).toMatchObject({ tournamentId, squadId: sessionId, reasons: 2 })
    expect(records().find((record) => record['msg'] === 'Squad deleted')).toBeUndefined()
  })

  it('passes a storage outage on as 503', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: SquadWriter = {
      create: outage,
      update: outage,
      getEditInfo: outage,
      remove: outage,
      getDeleteInfo: outage,
      complete: outage,
      getCompleteInfo: outage,
    }

    const response = await request(createSignedInTestApp({ squadWriter: writer })).delete(url)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  describe('who may call it (D-187, D-96)', () => {
    it('answers 401 when signed out', async () => {
      expect((await request(createTestApp()).delete(url)).status).toBe(401)
    })

    it('answers 403 to the API key and to a score keeper', async () => {
      const key = await request(createTestApp()).delete(url).set(apiKeyHeader, testApiKey)
      const keeper = await request(createSignedInTestApp({}, 'scoreKeeper')).delete(url)

      expect(key.status).toBe(403)
      expect(keeper.status).toBe(403)
    })

    it.each(['director', 'admin'] as const)('lets a %s delete', async (role) => {
      const { writer } = setup()
      const app = createSignedInTestApp({ squadWriter: writer }, role)

      expect((await request(app).delete(url)).status).toBe(204)
    })
  })
})

describe(`GET ${infoUrl}`, () => {
  it('answers the entry and score counts (D-188)', async () => {
    const { app } = setup({ deleteInfo: { [sessionId]: { entryCount: 12, scoreCount: 3 } } })

    const response = await request(app).get(infoUrl)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ deleteInfo: { entryCount: 12, scoreCount: 3 } })
  })

  it('answers zeros for a squad nobody is in (D-188)', async () => {
    const response = await request(setup().app).get(infoUrl)

    expect(response.body).toEqual({ deleteInfo: { entryCount: 0, scoreCount: 0 } })
  })

  it('answers 400 for a bad id and 404 for an unknown tournament or squad', async () => {
    const { app } = setup({ known: [tournamentId] })

    expect(
      (await request(app).get(`/v1/tournaments/${tournamentId}/squads/nope/delete-info`)).status,
    ).toBe(400)
    const unknownTournament = await request(app).get(
      `/v1/tournaments/66666666-6666-4666-8666-666666666666/squads/${sessionId}/delete-info`,
    )
    const unknown = await request(app).get(
      `/v1/tournaments/${tournamentId}/squads/66666666-6666-4666-8666-666666666666/delete-info`,
    )
    expect(unknownTournament.body).toEqual({ message: 'Tournament not found' })
    expect(unknown.body).toEqual({ message: 'Squad not found' })
  })

  it('passes a storage outage on as 503', async () => {
    const outage = () => Promise.reject(new HttpError(503, 'Database unavailable'))
    const writer: SquadWriter = {
      create: outage,
      update: outage,
      getEditInfo: outage,
      remove: outage,
      getDeleteInfo: outage,
      complete: outage,
      getCompleteInfo: outage,
    }

    expect(
      (await request(createSignedInTestApp({ squadWriter: writer })).get(infoUrl)).status,
    ).toBe(503)
  })

  it('needs sign-in and squads.write: 401, and 403 for the API key and a score keeper (D-187)', async () => {
    expect((await request(createTestApp()).get(infoUrl)).status).toBe(401)
    expect((await request(createTestApp()).get(infoUrl).set(apiKeyHeader, testApiKey)).status).toBe(
      403,
    )
    expect((await request(createSignedInTestApp({}, 'scoreKeeper')).get(infoUrl)).status).toBe(403)
  })
})
