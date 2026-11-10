import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { saveSkip, SkipError } from './api'

const squadPath = '/v1/tournaments/:id/squads/:sessionId/skip'

describe('saveSkip (SCR-23, D-235)', () => {
  it('sends the pattern with PUT as JSON and returns the saved one', async () => {
    let seen: { method: string; type: string | null; body: unknown; params: unknown } | undefined
    server.use(
      http.put(squadPath, async ({ request, params }) => {
        seen = {
          method: request.method,
          type: request.headers.get('content-type'),
          body: await request.json(),
          params,
        }
        return HttpResponse.json({ skip: 'same' })
      }),
    )

    await expect(saveSkip('squad', 'a b', 'c/d', 'same')).resolves.toBe('same')
    expect(seen).toEqual({
      method: 'PUT',
      type: 'application/json',
      body: { skip: 'same' },
      params: { id: 'a b', sessionId: 'c/d' },
    })
  })

  it('uses the sweeper path for a sweeper', async () => {
    server.use(
      http.put('/v1/tournaments/:id/sweepers/:sessionId/skip', () =>
        HttpResponse.json({ skip: 'staggered' }),
      ),
    )
    await expect(saveSkip('sweeper', 't1', 's1', 'staggered')).resolves.toBe('staggered')
  })

  it('says the connection failed when the request never answers', async () => {
    server.use(http.put(squadPath, () => HttpResponse.error()))
    const error = await saveSkip('squad', 't1', 's1', 'same').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SkipError)
    expect(error).toMatchObject({
      message: 'Could not save the skip. Check your connection and try again.',
    })
    expect((error as SkipError).status).toBeUndefined()
  })

  it('says a user without the permission may not change the skip (403)', async () => {
    server.use(http.put(squadPath, () => new HttpResponse(null, { status: 403 })))
    await expect(saveSkip('squad', 't1', 's1', 'same')).rejects.toMatchObject({
      message: 'You are not allowed to change the skip.',
      status: 403,
    })
  })

  it('keeps the API message for a 409, and a fallback when it sends none', async () => {
    server.use(
      http.put(squadPath, () =>
        HttpResponse.json({ message: 'This squad is complete.' }, { status: 409 }),
      ),
    )
    await expect(saveSkip('squad', 't1', 's1', 'same')).rejects.toMatchObject({
      message: 'This squad is complete.',
      status: 409,
    })
    for (const body of [{}, { message: '' }, { message: 5 }, 'text']) {
      server.use(http.put(squadPath, () => HttpResponse.json(body, { status: 409 })))
      await expect(saveSkip('squad', 't1', 's1', 'same')).rejects.toMatchObject({
        message: 'The skip cannot change now.',
        status: 409,
      })
    }
    server.use(http.put(squadPath, () => new HttpResponse('not json', { status: 409 })))
    await expect(saveSkip('squad', 't1', 's1', 'same')).rejects.toMatchObject({
      message: 'The skip cannot change now.',
    })
  })

  it('fails on another error status', async () => {
    server.use(http.put(squadPath, () => new HttpResponse(null, { status: 500 })))
    await expect(saveSkip('squad', 't1', 's1', 'same')).rejects.toMatchObject({
      message: 'Could not save the skip. Try again.',
      status: 500,
    })
    server.use(http.put(squadPath, () => new HttpResponse(null, { status: 400 })))
    await expect(saveSkip('squad', 't1', 's1', 'same')).rejects.toMatchObject({
      message: 'Could not save the skip. Try again.',
      status: 400,
    })
  })

  it.each([{ skip: 'zigzag' }, {}, 'text', null])(
    'fails on an answer of the wrong shape: %j',
    async (body) => {
      server.use(http.put(squadPath, () => HttpResponse.json(body)))
      await expect(saveSkip('squad', 't1', 's1', 'same')).rejects.toMatchObject({
        message: 'Could not save the skip (unexpected response).',
        status: 200,
      })
    },
  )

  it('fails on an answer that is not JSON', async () => {
    server.use(http.put(squadPath, () => new HttpResponse('nope')))
    await expect(saveSkip('squad', 't1', 's1', 'same')).rejects.toThrow('unexpected response')
  })
})
