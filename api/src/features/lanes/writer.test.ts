import { describe, expect, it } from 'vitest'
import { createInMemoryLaneWriter } from './writer.ts'

const tournamentId = 't0000000-0000-4000-8000-000000000001'
const sessionId = 's0000000-0000-4000-8000-000000000001'
const registrationId = 'r0000000-0000-4000-8000-000000000001'

function setup() {
  return createInMemoryLaneWriter({
    tournaments: [{ id: tournamentId }],
    sessions: [{ id: sessionId, tournamentId }],
    entries: [{ sessionId, registrationId }],
  })
}
const input = { tournamentId, kind: 'squad' as const, sessionId, registrationId, lane: 1 }

describe('in-memory lane writer', () => {
  it('stores the position it picks (LAN-18)', async () => {
    const { writer, state } = setup()
    await expect(writer.move(input)).resolves.toEqual({ type: 'move', position: '1A' })
    expect(state.entries[0]?.position).toBe('1A')
  })

  it('stores nothing when the plan refuses (LAN-13)', async () => {
    const { writer, state } = createInMemoryLaneWriter({
      tournaments: [{ id: tournamentId, complete: true }],
      sessions: [{ id: sessionId, tournamentId }],
      entries: [{ sessionId, registrationId }],
    })
    await expect(writer.move(input)).resolves.toMatchObject({ type: 'refused' })
    expect(state.entries[0]?.position).toBe('')
  })

  it('does not find a squad under the sweeper kind, or an unknown tournament (LAN-14)', async () => {
    const { writer } = setup()
    await expect(writer.move({ ...input, kind: 'sweeper' })).resolves.toEqual({
      notFound: 'session',
    })
    await expect(
      writer.move({ ...input, tournamentId: 'x0000000-0000-4000-8000-000000000009' }),
    ).resolves.toEqual({ notFound: 'tournament' })
  })

  it('does not find a session of another tournament (LAN-14)', async () => {
    const { writer } = createInMemoryLaneWriter({
      tournaments: [{ id: tournamentId }, { id: 'o0000000-0000-4000-8000-000000000002' }],
      sessions: [{ id: sessionId, tournamentId: 'o0000000-0000-4000-8000-000000000002' }],
      entries: [{ sessionId, registrationId }],
    })
    await expect(writer.move(input)).resolves.toEqual({ notFound: 'session' })
  })
})
