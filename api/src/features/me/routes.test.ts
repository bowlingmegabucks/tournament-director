import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createTestAuth, createTestUser, signInCookie, testPassword } from '../../test/testAuth.ts'
import { permissions } from '../../shared/auth/permissions.ts'
import type { RoleName } from '../../shared/auth/roles.ts'
import { meSchema } from './types.ts'

describe('GET /v1/me', () => {
  it('confirms a valid API key (API-17)', async () => {
    const response = await request(createTestApp()).get('/v1/me').set(apiKeyHeader, testApiKey)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ apiKey: true, user: null })
    expect(meSchema.parse(response.body)).toEqual(response.body)
  })

  it('answers apiKey false with no key (API-17)', async () => {
    const response = await request(createTestApp()).get('/v1/me')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ apiKey: false, user: null })
  })

  it.each(['wrong-key', '', testApiKey.toUpperCase()])(
    'answers 401 for the wrong key %j (API-17)',
    async (key) => {
      const response = await request(createTestApp()).get('/v1/me').set(apiKeyHeader, key)

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ message: 'Invalid API key.' })
    },
  )

  it('tells browsers and proxies not to keep the answer', async () => {
    const response = await request(createTestApp()).get('/v1/me')

    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('logs the caller type on the request line, and never the key (D-95)', async () => {
    const { logger, records } = createCapturedLogger()
    const app = createTestApp({ logger })

    await request(app).get('/v1/me').set(apiKeyHeader, testApiKey)
    await request(app).get('/v1/me')

    const lines = records().filter((line) => line['msg'] === 'Request completed')
    expect(lines.map((line) => line['callerType'])).toEqual(['apiKey', 'anonymous'])
    expect(JSON.stringify(records())).not.toContain(testApiKey)
  })
})

describe('GET /v1/me when someone is signed in', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function signedIn(role?: RoleName) {
    const { auth, database } = createTestAuth()
    if (role) {
      await createTestUser(auth, { role, name: 'Dee Director' })
    } else {
      // A user with no role at all: Better Auth gives them `none`.
      await auth.api.createUser({
        body: { email: 'ada@example.com', password: testPassword, name: 'Dee Director' },
      })
    }
    const cookie = await signInCookie(auth)
    return { auth, database, cookie, app: createTestApp({ auth }) }
  }

  it('returns the user with their roles and permissions (API-17)', async () => {
    const { app, cookie, database } = await signedIn('director')

    const response = await request(app).get('/v1/me').set('Cookie', cookie)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      apiKey: false,
      user: {
        id: database.user[0]?.['id'],
        email: 'ada@example.com',
        name: 'Dee Director',
        roles: ['director'],
        permissions: permissions.filter((p) => p !== 'users.manage' && p !== 'bowlers.ssn'),
      },
    })
    expect(meSchema.parse(response.body)).toEqual(response.body)
  })

  it('gives an admin every permission', async () => {
    const { app, cookie } = await signedIn('admin')

    const { body } = await request(app).get('/v1/me').set('Cookie', cookie)

    expect(body.user.roles).toEqual(['admin'])
    expect(body.user.permissions).toEqual([...permissions])
  })

  it('gives a score keeper only what collecting scores needs', async () => {
    const { app, cookie } = await signedIn('scoreKeeper')

    const { body } = await request(app).get('/v1/me').set('Cookie', cookie)

    expect(body.user.permissions).toEqual(['registrations.read', 'lanes.read', 'scores.write'])
  })

  it('returns a user who has no role, with empty lists and not null', async () => {
    const { app, cookie } = await signedIn()

    const { body } = await request(app).get('/v1/me').set('Cookie', cookie)

    expect(body.user).toMatchObject({ email: 'ada@example.com', roles: [], permissions: [] })
  })

  it('sends only the fields in the contract, never a password, hash, or token', async () => {
    const { app, cookie } = await signedIn('admin')

    const { body, text } = await request(app).get('/v1/me').set('Cookie', cookie)

    expect(Object.keys(body).sort()).toEqual(['apiKey', 'user'])
    expect(Object.keys(body.user).sort()).toEqual(['email', 'id', 'name', 'permissions', 'roles'])
    expect(text).not.toMatch(/password|hash|scrypt|token|banned/i)
  })

  it('reports the key and the user together when the request carries both', async () => {
    const { app, cookie } = await signedIn('director')

    const { body } = await request(app)
      .get('/v1/me')
      .set('Cookie', cookie)
      .set(apiKeyHeader, testApiKey)

    expect(body.apiKey).toBe(true)
    expect(body.user).not.toBeNull()
  })

  it('answers 401 for a wrong key even beside a good sign-in (API-17)', async () => {
    const { app, cookie } = await signedIn('director')

    const response = await request(app)
      .get('/v1/me')
      .set('Cookie', cookie)
      .set(apiKeyHeader, 'wrong')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ message: 'Invalid API key.' })
  })

  it('answers user null for a cookie whose session is gone', async () => {
    const { app } = await signedIn('director')

    const response = await request(app)
      .get('/v1/me')
      .set('Cookie', 'better-auth.session_token=gone.signature')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ apiKey: false, user: null })
  })

  it('answers user null once the session has expired', async () => {
    const { app, cookie, database } = await signedIn('director')
    const session = database.session[0]
    if (session) session['expiresAt'] = new Date(Date.now() - 1000)

    const { body } = await request(app).get('/v1/me').set('Cookie', cookie)

    expect(body.user).toBeNull()
  })

  it('answers user null for a banned user, at once', async () => {
    const { app, cookie, database } = await signedIn('director')
    const row = database.user[0]
    if (row) row['banned'] = true

    const { body } = await request(app).get('/v1/me').set('Cookie', cookie)

    expect(body.user).toBeNull()
  })

  it('follows a change of role on the next request', async () => {
    const { app, cookie, database } = await signedIn('director')
    const row = database.user[0]
    if (row) row['role'] = 'scoreKeeper'

    const { body } = await request(app).get('/v1/me').set('Cookie', cookie)

    expect(body.user.roles).toEqual(['scoreKeeper'])
    expect(body.user.permissions).toEqual(['registrations.read', 'lanes.read', 'scores.write'])
  })

  it.each([
    ['a signed-in user', true],
    ['a stale cookie', false],
  ])('tells browsers and proxies not to keep the answer for %s', async (_name, valid) => {
    const { app, cookie } = await signedIn('director')

    const response = await request(app)
      .get('/v1/me')
      .set('Cookie', valid ? cookie : 'better-auth.session_token=gone.signature')

    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('does not keep a 401 either', async () => {
    const { app } = await signedIn('director')

    const response = await request(app).get('/v1/me').set(apiKeyHeader, 'wrong')

    expect(response.headers['cache-control']).toBe('no-store')
  })

  describe('when the session cannot be checked', () => {
    it('answers 503, not user null, so the web app does not take an outage for being signed out', async () => {
      const { app, auth, cookie } = await signedIn('director')
      vi.spyOn(auth.api, 'getSession').mockRejectedValue(new Error('database is down'))

      const response = await request(app).get('/v1/me').set('Cookie', cookie)

      expect(response.status).toBe(503)
      expect(response.body).toEqual({ message: 'Sign-in could not be checked. Try again.' })
      expect(response.headers['cache-control']).toBe('no-store')
    })

    it('leaves a request with no cookie alone, so the registration site is not affected', async () => {
      const { app, auth } = await signedIn('director')
      vi.spyOn(auth.api, 'getSession').mockRejectedValue(new Error('database is down'))

      const response = await request(app).get('/v1/me').set(apiKeyHeader, testApiKey)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ apiKey: true, user: null })
    })
  })
})
