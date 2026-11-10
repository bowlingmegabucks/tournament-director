import { metrics } from '@opentelemetry/api'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createSessionEvents, type ChangeEvent } from '../../shared/events/sessionEvents.ts'
import { createSquad, createSweeper, createTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createSignedInTestApp, createTestApp } from '../../test/testApp.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createInMemorySkipStore } from './store.ts'

function setup(
  options: { complete?: boolean; tournamentComplete?: boolean; stored?: 'same' } = {},
) {
  const tournament = createTournament()
  const squad = createSquad({ complete: options.complete ?? false })
  const sweeper = createSweeper()
  const captured = createCapturedLogger('debug')
  const events = createSessionEvents(captured.logger, metrics.getMeter('test'))
  const seen: ChangeEvent[] = []
  events.subscribe(squad.id, { send: (event) => seen.push(event), end: () => undefined })
  const { store, state } = createInMemorySkipStore(options.stored ? { [squad.id]: 'same' } : {})
  const overrides = {
    logger: captured.logger,
    events,
    skipStore: store,
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
    squads: createInMemorySquadRepository([{ tournamentId: tournament.id, squad }]),
    sweepers: createInMemorySweeperRepository([{ tournamentId: tournament.id, sweeper }]),
  }
  const url = (session = squad.id, plural = 'squads') =>
    `/v1/tournaments/${tournament.id}/${plural}/${session}/skip`
  return { overrides, url, tournament, squad, sweeper, state, seen, captured }
}

describe('GET .../skip', () => {
  it('answers staggered when nothing is stored (SCR-23, D-235)', async () => {
    const { overrides, url } = setup()
    const response = await request(createSignedInTestApp(overrides, 'scoreKeeper')).get(url())
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ skip: 'staggered' })
  })

  it('answers the stored skip (SCR-23)', async () => {
    const { overrides, url } = setup({ stored: 'same' })
    const response = await request(createSignedInTestApp(overrides)).get(url())
    expect(response.body).toEqual({ skip: 'same' })
  })

  it('works on a sweeper, and a squad id is not a sweeper (SCR-23)', async () => {
    const { overrides, url, sweeper, squad } = setup()
    const app = createSignedInTestApp(overrides)
    const saved = await request(app).put(url(sweeper.id, 'sweepers')).send({ skip: 'same' })
    expect(saved.body).toEqual({ skip: 'same' })
    expect((await request(app).get(url(sweeper.id, 'sweepers'))).body).toEqual({ skip: 'same' })
    const wrongKind = await request(app).get(url(squad.id, 'sweepers'))
    expect(wrongKind.body).toEqual({ message: 'Sweeper not found' })
  })

  it('answers 404 for an unknown tournament or session (SCR-23)', async () => {
    const { overrides, tournament, squad } = setup()
    const app = createSignedInTestApp(overrides)
    const unknown = 'b0000000-0000-4000-8000-000000000009'
    const noTournament = await request(app).get(
      `/v1/tournaments/${unknown}/squads/${squad.id}/skip`,
    )
    expect(noTournament.body).toEqual({ message: 'Tournament not found' })
    const noSquad = await request(app).get(
      `/v1/tournaments/${tournament.id}/squads/${unknown}/skip`,
    )
    expect(noSquad.body).toEqual({ message: 'Squad not found' })
  })

  it('needs sign-in and refuses the API key (SCR-23, D-105)', async () => {
    const { overrides, url } = setup()
    const app = createTestApp(overrides)
    expect((await request(app).get(url())).status).toBe(401)
    expect((await request(app).get(url()).set(apiKeyHeader, testApiKey)).status).toBe(403)
  })
})

describe('PUT .../skip', () => {
  it('saves the skip and tells every screen of the session (SCR-23, D-235)', async () => {
    const { overrides, url, squad, state, seen } = setup()
    const response = await request(createSignedInTestApp(overrides, 'scoreKeeper'))
      .put(url())
      .send({ skip: 'same' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ skip: 'same' })
    expect(state.get(squad.id)).toBe('same')
    expect(seen).toEqual([{ kind: 'lanes', version: 1 }])
  })

  it('publishes nothing when the skip does not change (SCR-23)', async () => {
    const { overrides, url, seen } = setup({ stored: 'same' })
    const response = await request(createSignedInTestApp(overrides))
      .put(url())
      .send({ skip: 'same' })
    expect(response.body).toEqual({ skip: 'same' })
    expect(seen).toEqual([])
  })

  it('refuses a value that is not a skip with 400 (SCR-23)', async () => {
    const { overrides, url } = setup()
    const app = createSignedInTestApp(overrides)
    expect((await request(app).put(url()).send({ skip: 'zigzag' })).status).toBe(400)
    expect((await request(app).put(url()).send({})).status).toBe(400)
    expect((await request(app).put(url()).send({ skip: 'same', extra: 1 })).status).toBe(400)
  })

  it('refuses a complete squad and a complete tournament with 409 (SCR-14, D-231)', async () => {
    const complete = setup({ complete: true })
    const refused = await request(createSignedInTestApp(complete.overrides))
      .put(complete.url())
      .send({ skip: 'same' })
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual({ message: 'This squad is complete. The skip cannot change.' })
    expect(complete.state.size).toBe(0)

    const frozen = setup({ tournamentComplete: true })
    const response = await request(createSignedInTestApp(frozen.overrides))
      .put(frozen.url())
      .send({ skip: 'same' })
    expect(response.status).toBe(409)
  })

  it('answers 404 for an unknown session (SCR-23)', async () => {
    const { overrides, url } = setup()
    const response = await request(createSignedInTestApp(overrides))
      .put(url('b0000000-0000-4000-8000-000000000009'))
      .send({ skip: 'same' })
    expect(response.body).toEqual({ message: 'Squad not found' })
  })

  it('needs scores.write: no sign-in, no key, and a user without it are refused (SCR-23, D-96)', async () => {
    const { overrides, url } = setup()
    const app = createTestApp(overrides)
    expect((await request(app).put(url()).send({ skip: 'same' })).status).toBe(401)
    expect(
      (await request(app).put(url()).set(apiKeyHeader, testApiKey).send({ skip: 'same' })).status,
    ).toBe(403)
  })

  it('logs ids and the skip, never a name (SCR-23)', async () => {
    const { overrides, url, captured, squad } = setup()
    await request(createSignedInTestApp(overrides)).put(url()).send({ skip: 'same' })
    const line = captured.records().find((entry) => entry.msg === 'Skip changed')
    expect(line).toMatchObject({ squadId: squad.id, skip: 'same' })
  })
})
