import { trace, type Span } from '@opentelemetry/api'
import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import {
  createTestAuth,
  createTestUser,
  setCookies,
  signInCookie,
  testPassword,
} from '../../test/testAuth.ts'
import {
  apiKeyHeader,
  callerOf,
  identifyCaller,
  sentRejectedKey,
  sessionCheckFailed,
} from './caller.ts'
import { sessionSeconds } from './createAuth.ts'
import { permissions } from './permissions.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** An app that only reports who the caller is. */
async function whoApp() {
  const captured = createCapturedLogger()
  const test = createTestAuth({ logger: captured.logger })
  const app = express()
  app.use(identifyCaller({ apiKey: testApiKey, auth: test.auth, logger: captured.logger }))
  app.get('/who', (_req, res) => {
    res.json({
      caller: callerOf(res),
      rejectedKey: sentRejectedKey(res),
      sessionCheckFailed: sessionCheckFailed(res),
    })
  })
  return { app, ...test, records: captured.records }
}

describe('identifyCaller: the API key', () => {
  it.each([
    ['apiKey', testApiKey],
    ['anonymous', 'wrong-key'],
  ])('puts the caller type %s on the active trace span (D-95)', async (type, key) => {
    const setAttribute = vi.fn()
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ setAttribute } as unknown as Span)

    await request(createTestApp()).get('/v1/me').set(apiKeyHeader, key)

    expect(setAttribute).toHaveBeenCalledWith('caller.type', type)
    expect(setAttribute).not.toHaveBeenCalledWith('enduser.id', expect.anything())
  })

  it('knows the API key and no user', async () => {
    const { app } = await whoApp()

    const { body } = await request(app).get('/who').set(apiKeyHeader, testApiKey)

    expect(body.caller).toEqual({ type: 'apiKey', apiKey: true, user: null })
    expect(body.rejectedKey).toBe(false)
  })

  it('marks a wrong key, and treats the caller as anonymous', async () => {
    const { app } = await whoApp()

    const { body } = await request(app).get('/who').set(apiKeyHeader, 'wrong')

    expect(body.caller).toEqual({ type: 'anonymous', apiKey: false, user: null })
    expect(body.rejectedKey).toBe(true)
  })
})

describe('identifyCaller: the session cookie', () => {
  it('knows a signed-in user, with their roles and the permissions those roles hold', async () => {
    const { app, auth } = await whoApp()
    const user = await createTestUser(auth, { role: 'director', name: 'Dee Director' })
    const cookie = await signInCookie(auth)

    const { body } = await request(app).get('/who').set('Cookie', cookie)

    expect(body.caller).toMatchObject({
      type: 'user',
      apiKey: false,
      user: { id: user.id, email: 'ada@example.com', name: 'Dee Director', roles: ['director'] },
    })
    expect(body.caller.user.permissions).toContain('tournaments.write')
    expect(body.caller.user.permissions).not.toContain('users.manage')
  })

  it('gives each role the permissions in the role table', async () => {
    const { app, auth } = await whoApp()
    await createTestUser(auth, { role: 'scoreKeeper' })

    const { body } = await request(app)
      .get('/who')
      .set('Cookie', await signInCookie(auth))

    expect(body.caller.user.permissions).toEqual([
      'registrations.read',
      'lanes.read',
      'scores.write',
    ])
  })

  it('unions the permissions of several roles', async () => {
    const { app, auth } = await whoApp()
    await auth.api.createUser({
      body: {
        email: 'ada@example.com',
        password: testPassword,
        name: 'Ada',
        role: ['scoreKeeper', 'admin'],
      },
    })

    const { body } = await request(app)
      .get('/who')
      .set('Cookie', await signInCookie(auth))

    expect(body.caller.user.roles).toEqual(['scoreKeeper', 'admin'])
    expect(body.caller.user.permissions).toEqual([...permissions])
  })

  it('knows a user whose role is not one of ours, who holds nothing', async () => {
    const { app, auth } = await whoApp()
    await auth.api.createUser({
      body: { email: 'ada@example.com', password: testPassword, name: 'Ada' },
    })

    const { body } = await request(app)
      .get('/who')
      .set('Cookie', await signInCookie(auth))

    expect(body.caller.user).toMatchObject({ roles: [], permissions: [] })
  })

  it('never carries a password or hash on the caller', async () => {
    const { app, auth } = await whoApp()
    await createTestUser(auth)

    const { text } = await request(app)
      .get('/who')
      .set('Cookie', await signInCookie(auth))

    expect(text).not.toMatch(/password|hash|scrypt|token/i)
  })

  it('knows a user and the API key together', async () => {
    const { app, auth } = await whoApp()
    await createTestUser(auth)

    const { body } = await request(app)
      .get('/who')
      .set('Cookie', await signInCookie(auth))
      .set(apiKeyHeader, testApiKey)

    expect(body.caller).toMatchObject({ type: 'apiKeyAndUser', apiKey: true })
    expect(body.caller.user).not.toBeNull()
  })

  it('keeps the user when the key beside the sign-in is wrong, and notes the key', async () => {
    const { app, auth } = await whoApp()
    await createTestUser(auth)

    const { body } = await request(app)
      .get('/who')
      .set('Cookie', await signInCookie(auth))
      .set(apiKeyHeader, 'wrong')

    expect(body.caller).toMatchObject({ type: 'user', apiKey: false })
    expect(body.rejectedKey).toBe(true)
  })

  it('puts the caller type and the user id on the trace span, never the email', async () => {
    const setAttribute = vi.fn()
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ setAttribute } as unknown as Span)
    const { app, auth } = await whoApp()
    const user = await createTestUser(auth)

    await request(app)
      .get('/who')
      .set('Cookie', await signInCookie(auth))

    expect(setAttribute).toHaveBeenCalledWith('caller.type', 'user')
    expect(setAttribute).toHaveBeenCalledWith('enduser.id', user.id)
    expect(JSON.stringify(setAttribute.mock.calls)).not.toContain('ada@example.com')
  })

  it('does not look up a session for a request with no cookie', async () => {
    const { app, auth } = await whoApp()
    const getSession = vi.spyOn(auth.api, 'getSession')

    const { body } = await request(app).get('/who')

    expect(body.caller.type).toBe('anonymous')
    expect(getSession).not.toHaveBeenCalled()
  })

  it('does not look up a session for cookies that are not the session cookie', async () => {
    const { app, auth } = await whoApp()
    const getSession = vi.spyOn(auth.api, 'getSession')

    await request(app).get('/who').set('Cookie', 'theme=dark; consent=yes')

    expect(getSession).not.toHaveBeenCalled()
  })

  it('treats a session cookie it does not know as anonymous, without an error', async () => {
    const { app } = await whoApp()

    const { status, body } = await request(app)
      .get('/who')
      .set('Cookie', 'better-auth.session_token=not-a-real-token.signature')

    expect(status).toBe(200)
    expect(body.caller.type).toBe('anonymous')
    expect(body.sessionCheckFailed).toBe(false)
  })

  it('treats an expired session as anonymous', async () => {
    const { app, auth, database } = await whoApp()
    await createTestUser(auth)
    const cookie = await signInCookie(auth)
    const session = database.session[0]
    if (session) session['expiresAt'] = new Date(Date.now() - 1000)

    const { body } = await request(app).get('/who').set('Cookie', cookie)

    expect(body.caller.type).toBe('anonymous')
  })

  it('follows a role change on the next request, so a demotion applies at once (D-96)', async () => {
    const { app, auth, database } = await whoApp()
    await createTestUser(auth, { role: 'director' })
    const cookie = await signInCookie(auth)
    const row = database.user[0]
    if (row) row['role'] = 'scoreKeeper'

    const { body } = await request(app).get('/who').set('Cookie', cookie)

    expect(body.caller.user.roles).toEqual(['scoreKeeper'])
    expect(body.caller.user.permissions).not.toContain('tournaments.write')
  })

  describe('a user who is banned', () => {
    async function bannedApp(banned: boolean | null, banExpires: Date | null) {
      const world = await whoApp()
      await createTestUser(world.auth)
      const cookie = await signInCookie(world.auth)
      const row = world.database.user[0]
      if (row) Object.assign(row, { banned, banExpires })
      return { ...world, cookie }
    }

    it('counts as signed out at once, even if the session row is still there', async () => {
      const { app, cookie, database } = await bannedApp(true, null)

      const { body } = await request(app).get('/who').set('Cookie', cookie)

      expect(database.session).toHaveLength(1)
      expect(body.caller.type).toBe('anonymous')
    })

    it('counts as signed out until the ban ends', async () => {
      const { app, cookie } = await bannedApp(true, new Date(Date.now() + 3600_000))

      const { body } = await request(app).get('/who').set('Cookie', cookie)

      expect(body.caller.type).toBe('anonymous')
    })

    it('is let back in at the very moment the ban ends', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const { app, cookie, database } = await bannedApp(true, null)
      const endsAt = new Date(Date.now() + 60_000)
      const row = database.user[0]
      if (row) row['banExpires'] = endsAt
      vi.setSystemTime(endsAt)

      const { body } = await request(app).get('/who').set('Cookie', cookie)

      expect(body.caller.type).toBe('user')
    })

    it('is let back in when the ban has ended', async () => {
      const { app, cookie } = await bannedApp(true, new Date(Date.now() - 1000))

      const { body } = await request(app).get('/who').set('Cookie', cookie)

      expect(body.caller.type).toBe('user')
    })

    it.each([false, null])('is not held back when the banned flag is %j', async (flag) => {
      const { app, cookie } = await bannedApp(flag, null)

      const { body } = await request(app).get('/who').set('Cookie', cookie)

      expect(body.caller.type).toBe('user')
    })
  })

  describe('when the session lookup fails', () => {
    async function brokenApp() {
      const world = await whoApp()
      await createTestUser(world.auth)
      const cookie = await signInCookie(world.auth)
      vi.spyOn(world.auth.api, 'getSession').mockRejectedValue(new Error('database is down'))
      return { ...world, cookie }
    }

    it('does not fail the request, and does not call the caller signed out', async () => {
      const { app, cookie } = await brokenApp()

      const { status, body } = await request(app).get('/who').set('Cookie', cookie)

      expect(status).toBe(200)
      expect(body.caller.type).toBe('anonymous')
      expect(body.sessionCheckFailed).toBe(true)
    })

    it('still knows a valid API key', async () => {
      const { app, cookie } = await brokenApp()

      const { body } = await request(app)
        .get('/who')
        .set('Cookie', cookie)
        .set(apiKeyHeader, testApiKey)

      expect(body.caller.type).toBe('apiKey')
      expect(body.sessionCheckFailed).toBe(true)
    })

    it('logs a warning with the cause, and never the cookie', async () => {
      const { app, cookie, records } = await brokenApp()

      await request(app).get('/who').set('Cookie', cookie)

      const line = records().find((record) => record['msg'] === 'Could not check the session')
      expect(line).toMatchObject({ level: 40, err: { message: 'database is down' } })
      expect(JSON.stringify(records())).not.toContain(cookie.split('=')[1])
    })
  })

  describe('the session cookie coming back', () => {
    it('sends no cookie when nothing changed', async () => {
      const { app, auth } = await whoApp()
      await createTestUser(auth)
      const cookie = await signInCookie(auth)

      const response = await request(app).get('/who').set('Cookie', cookie)

      expect(setCookies(response)).toEqual([])
    })

    it('sends a fresh 12-hour cookie when the session is renewed (D-99)', async () => {
      const { app, auth, database } = await whoApp()
      await createTestUser(auth)
      const cookie = await signInCookie(auth)
      const session = database.session[0]
      if (session) session['expiresAt'] = new Date(Date.now() + 10 * 3600 * 1000)

      const response = await request(app).get('/who').set('Cookie', cookie)

      const renewed = setCookies(response).join(' | ')
      expect(renewed).toContain('session_token')
      expect(renewed).toContain(`Max-Age=${sessionSeconds}`)
      expect(renewed).toMatch(/HttpOnly/i)
    })
  })
})

describe('request logging', () => {
  it('puts the caller type and the user id on the request line, never the email', async () => {
    const captured = createCapturedLogger()
    const { auth } = createTestAuth({ logger: captured.logger })
    const user = await createTestUser(auth)
    const app = createTestApp({ auth, logger: captured.logger })

    await request(app)
      .get('/v1/me')
      .set('Cookie', await signInCookie(auth))

    const line = captured.records().find((record) => record['msg'] === 'Request completed')
    expect(line).toMatchObject({ callerType: 'user', userId: user.id })
    expect(JSON.stringify(captured.records())).not.toContain('ada@example.com')
  })

  it('leaves the user id off for someone who is not signed in', async () => {
    const captured = createCapturedLogger()
    const app = createTestApp({ logger: captured.logger })

    await request(app).get('/v1/me')

    const line = captured.records().find((record) => record['msg'] === 'Request completed')
    expect(line).not.toHaveProperty('userId')
  })
})
