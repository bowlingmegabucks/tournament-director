import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSquad } from '../../mocks/data'
import { SessionRejectedError, SessionWarningsError } from '../../shared/sessionEditApi'
import { updateSquad } from './api'

const path = '/v1/tournaments/:id/squads/:sessionId'

describe('updateSquad (SQD-23)', () => {
  it('patches the squad with only the changes and returns the squad', async () => {
    const squad = createSquad({ maxPerPair: 3 })
    let seen: { params: unknown; body: unknown } | undefined
    server.use(
      http.patch(path, async ({ params, request }) => {
        seen = { params, body: await request.json() }
        return HttpResponse.json({ squad })
      }),
    )

    await expect(updateSquad('t1', 's1', { maxPerPair: 3, entryFee: null })).resolves.toEqual(squad)

    expect(seen).toEqual({
      params: { id: 't1', sessionId: 's1' },
      body: { maxPerPair: 3, entryFee: null },
    })
  })

  it('adds confirmWarnings only when told to (D-129)', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch(path, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ squad: createSquad() })
      }),
    )

    await updateSquad('t1', 's1', { maxPerPair: 3 })
    await updateSquad('t1', 's1', { maxPerPair: 3 }, true)

    expect(bodies).toEqual([{ maxPerPair: 3 }, { maxPerPair: 3, confirmWarnings: true }])
  })

  it('throws a session error for a refusal and a warnings error for a confirm', async () => {
    server.use(
      http.patch(path, () =>
        HttpResponse.json({ message: 'No', errors: { maxPerPair: 'x' } }, { status: 409 }),
      ),
    )
    await expect(updateSquad('t1', 's1', {})).rejects.toBeInstanceOf(SessionRejectedError)

    server.use(
      http.patch(path, () =>
        HttpResponse.json(
          { message: 'Confirm', warnings: [{ field: 'entryFee', message: 'm' }] },
          { status: 409 },
        ),
      ),
    )
    await expect(updateSquad('t1', 's1', {})).rejects.toBeInstanceOf(SessionWarningsError)
  })

  it('rejects a response that is not a squad', async () => {
    server.use(http.patch(path, () => HttpResponse.json({ squad: { id: 'x' } })))

    await expect(updateSquad('t1', 's1', {})).rejects.toThrow(
      'Failed to save the squad (unexpected response)',
    )
  })
})
