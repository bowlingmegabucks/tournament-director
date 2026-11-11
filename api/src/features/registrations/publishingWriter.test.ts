import { metrics } from '@opentelemetry/api'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { createSessionEvents } from '../../shared/events/sessionEvents.ts'
import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import { createDivision, createSquad, createTournament, testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { sampleRequest } from '../../test/registrationRequests.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemorySweeperRepository } from '../sweepers/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'
import { createCommonBowler } from './bowler.testData.ts'
import { createPublishingRegistrationWriter } from './publishingWriter.ts'
import { createInMemoryRegistrationWriter, type SaveRegistration } from './writer.ts'

const tournamentId = 't0000000-0000-4000-8000-000000000001'
const divisionId = 'd0000000-0000-4000-8000-000000000001'
const bowlerId = 'b0000000-0000-4000-8000-000000000001'
const registrationId = 'r0000000-0000-4000-8000-000000000001'
const a = 'a0000000-0000-4000-8000-000000000001'
const b = 'a0000000-0000-4000-8000-000000000002'
const c = 'a0000000-0000-4000-8000-000000000003'

/** A hub that only records, so a test sees exactly what was published. */
function recordingHub() {
  const published: { sessionId: string; kind: string }[] = []
  const hub: SessionEvents = {
    subscribe: () => undefined,
    publish: (sessionId, kind) => published.push({ sessionId, kind }),
    closeAll: () => undefined,
    count: () => 0,
    watching: () => false,
  }
  return { hub, published }
}

function storage() {
  return createInMemoryRegistrationWriter({
    bowlers: [createCommonBowler({ id: bowlerId })],
    divisions: [{ id: divisionId, tournamentId }],
    sessions: [a, b, c].map((id) => ({
      id,
      tournamentId,
      kind: 'squad' as const,
      complete: false,
    })),
    registrations: [
      {
        tournamentId,
        registration: {
          id: registrationId,
          bowlerId,
          divisionId,
          average: 180,
          superSweeper: false,
          sessionIds: [a],
        },
      },
    ],
  })
}

const edit = (overrides: Partial<SaveRegistration> = {}): SaveRegistration => ({
  bowler: { id: bowlerId, isNew: false, patch: {} },
  registration: { id: registrationId, isNew: false, divisionId, average: 180, superSweeper: false },
  addSessionIds: [],
  payment: null,
  ...overrides,
})

describe('createPublishingRegistrationWriter', () => {
  it('tells the sessions a new registration joins (LAN-22, D-219)', async () => {
    const { hub, published } = recordingHub()
    const writer = createPublishingRegistrationWriter(
      storage().writer,
      hub,
      createCapturedLogger().logger,
    )

    await writer.save(
      edit({
        registration: {
          id: 'r0000000-0000-4000-8000-000000000002',
          isNew: true,
          divisionId,
          average: 170,
          superSweeper: false,
        },
        addSessionIds: [b],
      }),
    )

    expect(published).toEqual([{ sessionId: b, kind: 'entries' }])
  })

  it('tells the sessions a registration is in as well as the ones it adds and drops (LAN-22, D-219)', async () => {
    const { hub, published } = recordingHub()
    const writer = createPublishingRegistrationWriter(
      storage().writer,
      hub,
      createCapturedLogger().logger,
    )

    // In squad `a`; the save moves them to `b`, and an average change touches whatever stays.
    await writer.save(edit({ addSessionIds: [b], removeSessionIds: [a] }))

    expect(published.map((item) => item.sessionId).sort()).toEqual([a, b].sort())
    expect(published.every((item) => item.kind === 'entries')).toBe(true)
  })

  it('tells a session once, however many ways it is touched (LAN-22)', async () => {
    const { hub, published } = recordingHub()
    const writer = createPublishingRegistrationWriter(
      storage().writer,
      hub,
      createCapturedLogger().logger,
    )

    await writer.save(edit({ addSessionIds: [b] }))

    expect(published.map((item) => item.sessionId).sort()).toEqual([a, b].sort())
  })

  it('tells nothing when the save is stale and throws (LAN-22, D-199)', async () => {
    const { hub, published } = recordingHub()
    const writer = createPublishingRegistrationWriter(
      storage().writer,
      hub,
      createCapturedLogger().logger,
    )

    await expect(
      writer.save(edit({ addSessionIds: [b], expect: { present: [c], absent: [] } })),
    ).rejects.toThrow('changed')

    expect(published).toEqual([])
  })

  it('tells the sessions a deleted registration was in, read before they go (LAN-22, REG-19)', async () => {
    const { hub, published } = recordingHub()
    const writer = createPublishingRegistrationWriter(
      storage().writer,
      hub,
      createCapturedLogger().logger,
    )

    await writer.deleteRegistration(registrationId)

    expect(published).toEqual([{ sessionId: a, kind: 'entries' }])
  })

  it('tells no one when an unknown registration is deleted (LAN-22)', async () => {
    const { hub, published } = recordingHub()
    const writer = createPublishingRegistrationWriter(
      storage().writer,
      hub,
      createCapturedLogger().logger,
    )

    await writer.deleteRegistration('x0000000-0000-4000-8000-000000000009')

    expect(published).toEqual([])
  })

  it('tells the sessions after a desk delete, and nothing when the delete is refused or warns (LAN-22, D-209)', async () => {
    const { hub, published } = recordingHub()
    const inner = storage().writer
    const writer = createPublishingRegistrationWriter(inner, hub, createCapturedLogger().logger)

    const refused = await writer.removeForDesk(registrationId, tournamentId, () => ({
      kind: 'refused',
      errors: { scores: 'x' },
    }))
    const warned = await writer.removeForDesk(registrationId, tournamentId, () => ({
      kind: 'warn',
      message: 'm',
      paid: 5,
    }))
    expect(refused?.kind).toBe('refused')
    expect(warned?.kind).toBe('warn')
    expect(published).toEqual([])

    const done = await writer.removeForDesk(registrationId, tournamentId, () => ({
      kind: 'delete',
    }))
    expect(done?.kind).toBe('delete')
    expect(published).toEqual([{ sessionId: a, kind: 'entries' }])
  })

  it('does not publish for an unknown registration on a desk delete', async () => {
    const { hub, published } = recordingHub()
    const writer = createPublishingRegistrationWriter(
      storage().writer,
      hub,
      createCapturedLogger().logger,
    )
    const result = await writer.removeForDesk(
      'x0000000-0000-4000-8000-000000000009',
      tournamentId,
      () => ({
        kind: 'delete',
      }),
    )
    expect(result).toBeUndefined()
    expect(published).toEqual([])
  })

  it('still saves, and logs, when the sessions cannot be read first (LAN-22)', async () => {
    const { hub, published } = recordingHub()
    const { writer: inner, state } = storage()
    const broken = {
      ...inner,
      getDetail: vi.fn(() => Promise.reject(new Error('read failed'))),
    }
    const captured = createCapturedLogger()
    const writer = createPublishingRegistrationWriter(broken, hub, captured.logger)

    await writer.save(edit({ addSessionIds: [b] }))

    expect(state.registrations[0]?.registration.sessionIds).toContain(b)
    expect(published).toEqual([{ sessionId: b, kind: 'entries' }])
    expect(
      captured
        .records()
        .find((line) => line['msg'] === 'Could not read the sessions before a write'),
    ).toMatchObject({ level: 40, registrationId })
  })

  it('does not fail the write when a publish throws, and logs it (LAN-22, D-219)', async () => {
    const hub: SessionEvents = {
      subscribe: () => undefined,
      publish: () => {
        throw new Error('hub down')
      },
      closeAll: () => undefined,
      count: () => 0,
      watching: () => false,
    }
    const captured = createCapturedLogger()
    const { writer: inner, state } = storage()
    const writer = createPublishingRegistrationWriter(inner, hub, captured.logger)

    await expect(writer.save(edit({ addSessionIds: [b] }))).resolves.toBeUndefined()

    expect(state.registrations[0]?.registration.sessionIds).toContain(b)
    expect(
      captured.records().find((line) => line['msg'] === 'Could not publish an entry change'),
    ).toMatchObject({ level: 40, sessionId: a })
  })

  it('leaves the reads of the inner writer as they were', async () => {
    const { hub } = recordingHub()
    const { writer: inner } = storage()
    const writer = createPublishingRegistrationWriter(inner, hub, createCapturedLogger().logger)
    await expect(writer.getDetail(registrationId)).resolves.toEqual(
      await inner.getDetail(registrationId),
    )
  })
})

describe('the registration site (D-09, D-219)', () => {
  function app() {
    const tournament = createTournament({ startDate: '2026-10-23' })
    const division = createDivision()
    const squad = createSquad()
    const second = createSquad()
    const { writer } = createInMemoryRegistrationWriter({
      divisions: [{ id: division.id, tournamentId: tournament.id }],
      sessions: [
        { id: squad.id, tournamentId: tournament.id, kind: 'squad', complete: false },
        { id: second.id, tournamentId: tournament.id, kind: 'squad', complete: false },
      ],
    })
    const logger = createCapturedLogger().logger
    const events = createSessionEvents(logger, metrics.getMeter('test'))
    const seen: string[] = []
    for (const id of [squad.id, second.id]) {
      events.subscribe(id, { send: () => seen.push(id), end: () => undefined })
    }
    const body = (squads: string[]) =>
      sampleRequest({
        tournamentId: tournament.id,
        divisionId: division.id,
        squads,
        sweepers: [],
        payment: null,
      })
    const test = createTestApp({
      logger,
      events,
      tournaments: createInMemoryTournamentRepository([tournament]),
      divisions: createInMemoryDivisionRepository([{ tournamentId: tournament.id, division }]),
      squads: createInMemorySquadRepository([
        { tournamentId: tournament.id, squad },
        { tournamentId: tournament.id, squad: second },
      ]),
      sweepers: createInMemorySweeperRepository([]),
      registrationWriter: writer,
    })
    return { test, seen, squad, second, body }
  }

  it('a vendor create reaches the open lane pages of its squad, with the same 201 (API-05)', async () => {
    const { test, seen, squad, body } = app()

    const response = await request(test)
      .post('/v1/registrations')
      .set(apiKeyHeader, testApiKey)
      .send(body([squad.id]))

    expect(response.status).toBe(201)
    expect(seen).toEqual([squad.id])
  })

  it('a vendor append tells the new squad and the one the bowler was in (REG-01, API-05)', async () => {
    const { test, seen, squad, second, body } = app()
    await request(test)
      .post('/v1/registrations')
      .set(apiKeyHeader, testApiKey)
      .send(body([squad.id]))
    seen.length = 0

    const response = await request(test)
      .post('/v1/registrations')
      .set(apiKeyHeader, testApiKey)
      .send(body([second.id]))

    expect(response.status).toBe(201)
    expect(seen.sort()).toEqual([squad.id, second.id].sort())
  })

  it('a vendor delete tells the squads it leaves (API-08)', async () => {
    const { test, seen, squad, body } = app()
    const created = await request(test)
      .post('/v1/registrations')
      .set(apiKeyHeader, testApiKey)
      .send(body([squad.id]))
    seen.length = 0

    const response = await request(test)
      .delete(`/v1/registrations/${(created.body as { registrationId: string }).registrationId}`)
      .set(apiKeyHeader, testApiKey)

    expect(response.status).toBe(204)
    expect(seen).toEqual([squad.id])
  })
})
