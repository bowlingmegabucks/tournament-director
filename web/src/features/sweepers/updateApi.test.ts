import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSweeper } from '../../mocks/data'
import { SessionRejectedError, SessionWarningsError } from '../../shared/sessionEditApi'
import { updateSweeper } from './api'

const path = '/v1/tournaments/:id/sweepers/:sessionId'

describe('updateSweeper (SQD-23, SQD-29)', () => {
  it('patches the sweeper with only the changes, pins included, and returns the sweeper', async () => {
    const sweeper = createSweeper({ games: 4 })
    let seen: { params: unknown; body: unknown } | undefined
    server.use(
      http.patch(path, async ({ params, request }) => {
        seen = { params, body: await request.json() }
        return HttpResponse.json({ sweeper })
      }),
    )

    await expect(
      updateSweeper('t1', 'w1', { games: 4, bonusPins: { d1: null, d2: 6 } }),
    ).resolves.toEqual(sweeper)

    expect(seen).toEqual({
      params: { id: 't1', sessionId: 'w1' },
      body: { games: 4, bonusPins: { d1: null, d2: 6 } },
    })
  })

  it('adds confirmWarnings only when told to (D-129)', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch(path, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ sweeper: createSweeper() })
      }),
    )

    await updateSweeper('t1', 'w1', { games: 4 })
    await updateSweeper('t1', 'w1', { games: 4 }, true)

    expect(bodies).toEqual([{ games: 4 }, { games: 4, confirmWarnings: true }])
  })

  it('throws a session error for a refusal and a warnings error for a confirm', async () => {
    server.use(
      http.patch(path, () =>
        HttpResponse.json({ message: 'No', errors: { games: 'x' } }, { status: 409 }),
      ),
    )
    await expect(updateSweeper('t1', 'w1', {})).rejects.toBeInstanceOf(SessionRejectedError)

    server.use(
      http.patch(path, () =>
        HttpResponse.json(
          { message: 'Confirm', warnings: [{ field: 'cashRatio', message: 'm' }] },
          { status: 409 },
        ),
      ),
    )
    await expect(updateSweeper('t1', 'w1', {})).rejects.toBeInstanceOf(SessionWarningsError)
  })

  it('rejects a response that is not a sweeper', async () => {
    server.use(http.patch(path, () => HttpResponse.json({ sweeper: { id: 'x' } })))

    await expect(updateSweeper('t1', 'w1', {})).rejects.toThrow(
      'Failed to save the sweeper (unexpected response)',
    )
  })
})
