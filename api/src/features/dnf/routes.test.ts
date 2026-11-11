import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createSessionEvents, type ChangeEvent } from '../../shared/events/sessionEvents.ts'
import { metrics } from '@opentelemetry/api'
import {
  createDivision,
  createLaneEntry,
  createSquad,
  createSweeper,
  createTournament,
  testApiKey,
} from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import { createInMemoryScoreRepository } from '../scores/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemoryDnfStore, type DnfStore } from './store.ts'

function setup(options: { complete?: boolean; tournamentComplete?: boolean } = {}) {
  const tournament = createTournament()
  const open = createDivision({ number: 1, name: 'Open' })
  const squad = createSquad({ complete: options.complete ?? false })
  const sweeper = createSweeper()
  const scored = createLaneEntry({ divisionId: open.id })
  const unscored = createLaneEntry({ divisionId: open.id })
  const alsoScored = createLaneEntry({ divisionId: open.id })
  const inSweeper = createLaneEntry({ divisionId: open.id })
  const dnf = createInMemoryDnfStore()
  const captured = createCapturedLogger('debug')
  const events = createSessionEvents(captured.logger, metrics.getMeter('test'))
  const seen: { sessionId: string; event: ChangeEvent }[] = []
  for (const sessionId of [squad.id, sweeper.id]) {
    events.subscribe(sessionId, {
      send: (event) => seen.push({ sessionId, event }),
      end: () => undefined,
    })
  }
  const overrides = {
    logger: captured.logger,
    events,
    dnfStore: dnf.store,
    tournaments: createInMemoryTournamentRepository(
      [tournament],
      {},
      options.tournamentComplete
        ? {
            [tournament.id]: {
              games: 3,
              finalsRatio: 7,
              cashRatio: 5,
              superSweeperCashRatio: 5,
              completed: true,
            },
          }
        : {},
    ),
    divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division: open }]),
    squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
    lanes: createInMemoryLaneRepository([
      { sessionId: squad.id, entry: scored },
      { sessionId: squad.id, entry: unscored },
      { sessionId: squad.id, entry: alsoScored },
      { sessionId: sweeper.id, entry: inSweeper },
    ]),
    scores: createInMemoryScoreRepository([
      { sessionId: squad.id, score: { bowlerId: scored.bowlerId, game: 1, score: 200 } },
      { sessionId: squad.id, score: { bowlerId: alsoScored.bowlerId, game: 1, score: 180 } },
      { sessionId: sweeper.id, score: { bowlerId: inSweeper.bowlerId, game: 1, score: 190 } },
    ]),
  }
  const url = (registrationId: string, session = squad.id, plural = 'squads') =>
    `/v1/tournaments/${tournament.id}/${plural}/${session}/scores/${registrationId}/dnf`
  return {
    overrides,
    url,
    tournament,
    squad,
    sweeper,
    scored,
    unscored,
    inSweeper,
    dnf,
    seen,
    captured,
  }
}

/** The store, but its guarded write always answers `outcome`, as if a rival write came first. */
function dnf409(store: DnfStore, outcome: 'complete' | 'no-score'): DnfStore {
  return { ...store, setIfOpen: () => Promise.resolve(outcome) }
}

describe('PUT .../scores/:registrationId/dnf (SCR-24)', () => {
  it('flags a bowler who has a score, answers 204, and tells the screens (D-248, D-249, D-251)', async () => {
    const { overrides, url, scored, squad, dnf, seen } = setup()

    const response = await request(createSignedInTestApp(overrides, 'scoreKeeper')).put(
      url(scored.registrationId),
    )

    expect(response.status).toBe(204)
    expect(dnf.state).toEqual(new Set([`${squad.id}|${scored.registrationId}`]))
    expect(seen.map((item) => [item.sessionId, item.event.kind])).toEqual([[squad.id, 'scores']])
  })

  it('answers 204 again for a repeat and tells nobody (SCR-24)', async () => {
    const { overrides, url, scored, seen } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url(scored.registrationId))
    seen.length = 0

    expect((await request(app).put(url(scored.registrationId))).status).toBe(204)
    expect(seen).toEqual([])
  })

  it('answers 409 when the write itself finds the squad complete, and tells nobody (D-249)', async () => {
    // A Complete landed after the route's reads: the store's own check refuses.
    const { overrides, url, scored, seen } = setup()
    const racing = { ...dnf409(overrides.dnfStore, 'complete') }

    const response = await request(createSignedInTestApp({ ...overrides, dnfStore: racing })).put(
      url(scored.registrationId),
    )

    expect(response.status).toBe(409)
    expect(response.body.message).toMatch(/complete/)
    expect(seen).toEqual([])
  })

  it('answers 409 when the write finds the score gone, and tells nobody (D-249)', async () => {
    const { overrides, url, scored, seen } = setup()
    const racing = { ...dnf409(overrides.dnfStore, 'no-score') }

    const response = await request(createSignedInTestApp({ ...overrides, dnfStore: racing })).put(
      url(scored.registrationId),
    )

    expect(response.status).toBe(409)
    expect(response.body.message).toMatch(/no score/)
    expect(seen).toEqual([])
  })

  it('works on a sweeper (SCR-24)', async () => {
    const { overrides, url, inSweeper, sweeper, dnf } = setup()

    const response = await request(createSignedInTestApp(overrides)).put(
      url(inSweeper.registrationId, sweeper.id, 'sweepers'),
    )

    expect(response.status).toBe(204)
    expect(dnf.state).toEqual(new Set([`${sweeper.id}|${inSweeper.registrationId}`]))
  })

  it('refuses a bowler with no saved score with 409 (SCR-24, D-248)', async () => {
    const { overrides, url, unscored, dnf } = setup()

    const response = await request(createSignedInTestApp(overrides)).put(
      url(unscored.registrationId),
    )

    expect(response.status).toBe(409)
    expect(response.body.message).toMatch(/no score yet/)
    expect(dnf.state.size).toBe(0)
  })

  it('refuses a complete squad and a complete tournament with 409 (SCR-24, D-231)', async () => {
    for (const options of [{ complete: true }, { tournamentComplete: true }]) {
      const { overrides, url, scored, dnf, captured } = setup(options)

      const response = await request(createSignedInTestApp(overrides)).put(
        url(scored.registrationId),
      )

      expect(response.status).toBe(409)
      expect(response.body.message).toMatch(/complete/)
      expect(dnf.state.size).toBe(0)
      expect(captured.records().some((line) => /DNF change refused/.test(String(line.msg)))).toBe(
        true,
      )
    }
  })

  it('answers 404 for an unknown tournament, session, or bowler (SCR-24)', async () => {
    const { overrides, url, tournament, squad, scored } = setup()
    const app = createSignedInTestApp(overrides)
    const unknown = crypto.randomUUID()

    expect(
      (
        await request(app).put(
          `/v1/tournaments/${unknown}/squads/${squad.id}/scores/${scored.registrationId}/dnf`,
        )
      ).body.message,
    ).toBe('Tournament not found')
    expect(
      (
        await request(app).put(
          `/v1/tournaments/${tournament.id}/squads/${unknown}/scores/${scored.registrationId}/dnf`,
        )
      ).body.message,
    ).toBe('Squad not found')
    expect((await request(app).put(url(unknown))).body.message).toBe(
      'Bowler is not registered for this squad',
    )
    expect(
      (await request(app).put(url(scored.registrationId, unknown, 'sweepers'))).body.message,
    ).toBe('Sweeper not found')
  })

  it('refuses a bowler of another session as not registered (SCR-24)', async () => {
    const { overrides, url, inSweeper } = setup()
    const response = await request(createSignedInTestApp(overrides)).put(
      url(inSweeper.registrationId),
    )
    expect(response.status).toBe(404)
  })

  it('needs scores.write, and the API key cannot reach it (SCR-24, D-96)', async () => {
    const { overrides, url, scored } = setup()
    const app = createTestApp(overrides)

    expect((await request(app).put(url(scored.registrationId))).status).toBe(401)
    expect(
      (await request(app).put(url(scored.registrationId)).set(apiKeyHeader, testApiKey)).status,
    ).toBe(403)
  })

  it('refuses an id that is not a UUID with 400 (SCR-24)', async () => {
    const { overrides, url } = setup()
    expect((await request(createSignedInTestApp(overrides)).put(url('nope'))).status).toBe(400)
  })

  it('logs the flag with ids and no name (SCR-24)', async () => {
    const { overrides, url, scored, captured, squad } = setup()
    await request(createSignedInTestApp(overrides)).put(url(scored.registrationId))

    const line = captured.records().find((entry) => entry.msg === 'Did not finish set')
    expect(line).toMatchObject({ squadId: squad.id, registrationId: scored.registrationId })
    expect(JSON.stringify(line)).not.toContain(scored.name)
  })
})

describe('PUT .../scores/:registrationId/dnf: which scores count (SCR-24)', () => {
  it('looks at the bowler\u2019s own score, not at everyone\u2019s, and logs a refusal', async () => {
    const { overrides, url, scored, unscored, dnf, captured } = setup()
    const app = createSignedInTestApp(overrides)

    // Another bowler of the squad has a score too (see `alsoScored` in the setup).
    expect((await request(app).put(url(scored.registrationId))).status).toBe(204)
    expect((await request(app).put(url(unscored.registrationId))).status).toBe(409)

    expect(dnf.state.size).toBe(1)
    expect(captured.records().some((line) => line.msg === 'DNF change refused: no score')).toBe(
      true,
    )
  })

  it('logs when a flag is taken off', async () => {
    const { overrides, url, scored, captured } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url(scored.registrationId))

    await request(app).delete(url(scored.registrationId))

    expect(captured.records().some((line) => line.msg === 'Did not finish cleared')).toBe(true)
  })
})

describe('DELETE .../scores/:registrationId/dnf (SCR-24)', () => {
  it('removes a flag, answers 204, and tells the screens (D-249)', async () => {
    const { overrides, url, scored, squad, dnf, seen } = setup()
    const app = createSignedInTestApp(overrides)
    await request(app).put(url(scored.registrationId))
    seen.length = 0

    const response = await request(app).delete(url(scored.registrationId))

    expect(response.status).toBe(204)
    expect(dnf.state.size).toBe(0)
    expect(seen.map((item) => [item.sessionId, item.event.kind])).toEqual([[squad.id, 'scores']])
  })

  it('answers 204 for a bowler with no flag and tells nobody (SCR-24)', async () => {
    const { overrides, url, scored, seen } = setup()

    expect(
      (await request(createSignedInTestApp(overrides)).delete(url(scored.registrationId))).status,
    ).toBe(204)
    expect(seen).toEqual([])
  })

  it('may undo a flag for a bowler with no score (SCR-24)', async () => {
    const { overrides, url, unscored } = setup()
    expect(
      (await request(createSignedInTestApp(overrides)).delete(url(unscored.registrationId))).status,
    ).toBe(204)
  })

  it('refuses a complete session with 409 (SCR-24, D-231)', async () => {
    const { overrides, url, scored } = setup({ complete: true })
    const response = await request(createSignedInTestApp(overrides)).delete(
      url(scored.registrationId),
    )
    expect(response.status).toBe(409)
  })

  it('needs scores.write, and the API key cannot reach it (SCR-24, D-96)', async () => {
    const { overrides, url, scored } = setup()
    const app = createTestApp(overrides)
    expect((await request(app).delete(url(scored.registrationId))).status).toBe(401)
    expect(
      (await request(app).delete(url(scored.registrationId)).set(apiKeyHeader, testApiKey)).status,
    ).toBe(403)
  })

  it('does not read a score route: `dnf` is not a game number (SCR-24)', async () => {
    const { overrides, url, scored } = setup()
    const response = await request(createSignedInTestApp(overrides)).delete(
      url(scored.registrationId),
    )
    expect(response.status).toBe(204)
  })
})
