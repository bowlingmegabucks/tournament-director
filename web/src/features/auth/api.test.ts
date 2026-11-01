import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSignedInUser } from '../../mocks/data'
import { fetchMe, signIn, signOut } from './api'

describe('fetchMe', () => {
  it('returns the user with roles and permissions', async () => {
    const user = createSignedInUser({ roles: ['scoreKeeper'] })
    server.use(http.get('/v1/me', () => HttpResponse.json({ apiKey: false, user })))

    expect(await fetchMe()).toEqual({ user })
  })

  it('treats user null as signed out, not an error', async () => {
    server.use(http.get('/v1/me', () => HttpResponse.json({ apiKey: false, user: null })))

    expect(await fetchMe()).toEqual({ user: null })
  })

  it('keeps a permission it does not know', async () => {
    const user = createSignedInUser({ roles: [], permissions: ['future.thing'] })
    server.use(http.get('/v1/me', () => HttpResponse.json({ apiKey: false, user })))

    expect((await fetchMe()).user?.permissions).toEqual(['future.thing'])
  })

  it.each([503, 401, 500])(
    'fails on status %i rather than reporting signed out',
    async (status) => {
      server.use(http.get('/v1/me', () => new HttpResponse(null, { status })))

      await expect(fetchMe()).rejects.toThrow('Sign-in could not be checked. Try again.')
    },
  )

  it('fails when the body is not JSON', async () => {
    server.use(http.get('/v1/me', () => new HttpResponse('nope')))

    await expect(fetchMe()).rejects.toThrow('Sign-in could not be checked')
  })

  it.each([
    ['a user missing permissions', { id: 'a', email: 'a', name: 'a', roles: [] }],
    ['a user missing roles', { id: 'a', email: 'a', name: 'a', permissions: [] }],
    ['a user with a numeric id', { id: 1, email: 'a', name: 'a', roles: [], permissions: [] }],
    ['a user with a numeric email', { id: 'a', email: 1, name: 'a', roles: [], permissions: [] }],
    ['a user with a numeric name', { id: 'a', email: 'a', name: 1, roles: [], permissions: [] }],
    ['roles that are not strings', { id: 'a', email: 'a', name: 'a', roles: [1], permissions: [] }],
    ['no user field', undefined],
  ])('fails on %s', async (_label, user) => {
    server.use(http.get('/v1/me', () => HttpResponse.json({ user })))

    await expect(fetchMe()).rejects.toThrow('Sign-in could not be checked. Try again.')
  })
})

describe('signIn', () => {
  it('posts the email and password as JSON', async () => {
    let received: unknown
    let contentType: string | null = null
    server.use(
      http.post('/v1/auth/sign-in/email', async ({ request }) => {
        received = await request.json()
        contentType = request.headers.get('Content-Type')
        return HttpResponse.json({ redirect: false })
      }),
    )

    await signIn('a@b.com', 'secret')

    expect(received).toEqual({ email: 'a@b.com', password: 'secret' })
    expect(contentType).toBe('application/json')
  })

  const respond = (status: number, body?: unknown, headers?: Record<string, string>) =>
    server.use(
      http.post('/v1/auth/sign-in/email', () =>
        body === undefined
          ? new HttpResponse(null, { status, headers })
          : HttpResponse.json(body, { status, headers }),
      ),
    )

  it('says the email or password is wrong on 401', async () => {
    respond(401, { message: 'Invalid email or password', code: 'INVALID_EMAIL_OR_PASSWORD' })

    await expect(signIn('a', 'b')).rejects.toThrow('Email or password is wrong.')
  })

  it('says the account is disabled', async () => {
    respond(403, { code: 'BANNED_USER', message: 'You have been banned' })

    await expect(signIn('a', 'b')).rejects.toThrow('This account is disabled. Ask an admin.')
  })

  it('says sign-in is not set up for an untrusted origin', async () => {
    respond(403, { code: 'INVALID_ORIGIN', message: 'Invalid origin' })

    await expect(signIn('a', 'b')).rejects.toThrow('Sign-in is not set up for this address.')
  })

  it('falls back to the service message on any other 403', async () => {
    respond(403, { code: 'OTHER', message: 'Nope' })

    await expect(signIn('a', 'b')).rejects.toThrow(
      'Could not reach the sign-in service. Try again.',
    )
  })

  it('falls back to the service message on a 403 without JSON', async () => {
    respond(403)

    await expect(signIn('a', 'b')).rejects.toThrow(
      'Could not reach the sign-in service. Try again.',
    )
  })

  it.each([
    ['900', 'Too many attempts. Wait 15 minutes and try again.'],
    ['901', 'Too many attempts. Wait 16 minutes and try again.'],
    ['60', 'Too many attempts. Wait 1 minute and try again.'],
    ['1', 'Too many attempts. Wait 1 minute and try again.'],
    ['0', 'Too many attempts. Try again later.'],
    ['soon', 'Too many attempts. Try again later.'],
  ])('on 429 with Retry-After %s says "%s"', async (retryAfter, message) => {
    respond(
      429,
      { message: 'Too many sign-in attempts. Try again later.' },
      { 'Retry-After': retryAfter },
    )

    await expect(signIn('a', 'b')).rejects.toThrow(message)
  })

  it('does not guess a wait on 429 without Retry-After', async () => {
    respond(429, { message: 'x' })

    await expect(signIn('a', 'b')).rejects.toThrow('Too many attempts. Try again later.')
  })

  it.each([400, 500, 503])('says the service is unreachable on %i', async (status) => {
    respond(status, { message: 'Database unavailable' })

    await expect(signIn('a', 'b')).rejects.toThrow(
      'Could not reach the sign-in service. Try again.',
    )
  })

  it('says the service is unreachable on a network failure', async () => {
    server.use(http.post('/v1/auth/sign-in/email', () => HttpResponse.error()))

    await expect(signIn('a', 'b')).rejects.toThrow(
      'Could not reach the sign-in service. Try again.',
    )
  })
})

describe('signOut', () => {
  it('posts an empty JSON body', async () => {
    let received: unknown
    server.use(
      http.post('/v1/auth/sign-out', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ success: true })
      }),
    )

    await signOut()

    expect(received).toEqual({})
  })

  it('fails on a bad status', async () => {
    server.use(http.post('/v1/auth/sign-out', () => new HttpResponse(null, { status: 403 })))

    await expect(signOut()).rejects.toThrow('Could not sign out. Try again.')
  })
})
