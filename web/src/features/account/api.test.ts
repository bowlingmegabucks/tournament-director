import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { AccountError, changePassword, updateName } from './api'

const rejects = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(AccountError)
  return (error as AccountError).message
}

describe('changePassword', () => {
  it('posts both passwords as JSON', async () => {
    let sent: unknown
    let method = ''
    let type: string | null = null
    server.use(
      http.post('/v1/account/password', async ({ request }) => {
        sent = await request.json()
        method = request.method
        type = request.headers.get('Content-Type')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await changePassword('old one', 'new one')

    expect(sent).toEqual({ currentPassword: 'old one', newPassword: 'new one' })
    expect(method).toBe('POST')
    expect(type).toBe('application/json')
  })

  it.each([
    [401, 'You are signed out. Sign in again and retry.'],
    [500, 'The password could not be changed. Try again.'],
    [403, 'The password could not be changed. Try again.'],
  ])('turns a %s into a message', async (status, message) => {
    server.use(http.post('/v1/account/password', () => new HttpResponse(null, { status })))

    expect(await rejects(changePassword('a', 'b'))).toBe(message)
  })

  it('shows the API message for a 400', async () => {
    server.use(
      http.post('/v1/account/password', () =>
        HttpResponse.json({ message: 'The current password is wrong.' }, { status: 400 }),
      ),
    )

    expect(await rejects(changePassword('a', 'b'))).toBe('The current password is wrong.')
  })

  it('falls back to a general message for a 400 with no usable message', async () => {
    server.use(http.post('/v1/account/password', () => new HttpResponse('nope', { status: 400 })))
    expect(await rejects(changePassword('a', 'b'))).toBe(
      'The password could not be changed. Try again.',
    )

    server.use(
      http.post('/v1/account/password', () => HttpResponse.json({ message: '' }, { status: 400 })),
    )
    expect(await rejects(changePassword('a', 'b'))).toBe(
      'The password could not be changed. Try again.',
    )
  })

  it('says how long to wait on a 429, and falls back with no Retry-After', async () => {
    server.use(
      http.post(
        '/v1/account/password',
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '60' } }),
      ),
    )
    expect(await rejects(changePassword('a', 'b'))).toBe(
      'Too many attempts. Wait 1 minute and try again.',
    )

    server.use(http.post('/v1/account/password', () => new HttpResponse(null, { status: 429 })))
    expect(await rejects(changePassword('a', 'b'))).toBe('Too many attempts. Try again later.')
  })

  it('reports a network failure', async () => {
    server.use(http.post('/v1/account/password', () => HttpResponse.error()))

    expect(await rejects(changePassword('a', 'b'))).toBe('Could not reach the server. Try again.')
  })
})

describe('failures the page must not echo', () => {
  it('ignores the API message unless the status is 400', async () => {
    server.use(
      http.post('/v1/account/password', () =>
        HttpResponse.json({ message: 'internal detail' }, { status: 500 }),
      ),
    )

    expect(await rejects(changePassword('a', 'b'))).toBe(
      'The password could not be changed. Try again.',
    )
  })
})

describe('updateName', () => {
  it('sends JSON', async () => {
    let type: string | null = null
    server.use(
      http.patch('/v1/account', ({ request }) => {
        type = request.headers.get('Content-Type')
        return HttpResponse.json({ name: 'x' })
      }),
    )

    await updateName('x')

    expect(type).toBe('application/json')
  })

  it('says the answer could not be read when a 200 is not JSON', async () => {
    server.use(http.patch('/v1/account', () => new HttpResponse('saved', { status: 200 })))

    const error = await updateName('x').catch((caught: unknown) => caught)

    expect(error).toEqual(
      new Error('The name was saved, but the answer could not be read (response is not JSON)'),
    )
  })

  it('patches the name and returns the saved one', async () => {
    let sent: unknown
    let method = ''
    server.use(
      http.patch('/v1/account', async ({ request }) => {
        sent = await request.json()
        method = request.method
        return HttpResponse.json({ name: 'Dee D' })
      }),
    )

    expect(await updateName('Dee D')).toBe('Dee D')
    expect(sent).toEqual({ name: 'Dee D' })
    expect(method).toBe('PATCH')
  })

  it('turns a failure into a message', async () => {
    server.use(http.patch('/v1/account', () => new HttpResponse(null, { status: 500 })))

    expect(await rejects(updateName('x'))).toBe('The name could not be saved. Try again.')
  })

  it('rejects an answer with no name', async () => {
    server.use(http.patch('/v1/account', () => HttpResponse.json({})))

    expect(await rejects(updateName('x'))).toBe(
      'The name was saved, but the answer could not be read.',
    )
  })

  it('reports a network failure', async () => {
    server.use(http.patch('/v1/account', () => HttpResponse.error()))

    expect(await rejects(updateName('x'))).toBe('Could not reach the server. Try again.')
  })
})
