import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { sessionSeconds } from '../../shared/auth/createAuth.ts'
import { signInAttempts } from '../../shared/auth/signInLimit.ts'
import { createConfig } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import {
  cookieOf,
  createTestAuth,
  createTestUser,
  setCookies,
  testPassword,
  type TestAuthOptions,
} from '../../test/testAuth.ts'

const signInPath = '/v1/auth/sign-in/email'

async function setup(options: TestAuthOptions = {}) {
  const captured = createCapturedLogger()
  const { auth, database } = createTestAuth({ ...options, logger: captured.logger })
  const user = await createTestUser(auth)
  const app = createTestApp({ auth, logger: captured.logger })
  const signIn = (password = testPassword, email = user.email) =>
    request(app).post(signInPath).send({ email, password })
  return { app, auth, database, user, signIn, records: captured.records }
}

describe('POST /v1/auth/sign-in/email', () => {
  it('signs in and sets a session cookie that page scripts cannot read (D-99)', async () => {
    const { signIn, user } = await setup()

    const response = await signIn()

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({ email: user.email, role: 'admin' })
    const cookie = setCookies(response).join(' | ')
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Path=\//i)
    expect(cookie).toContain(`Max-Age=${sessionSeconds}`)
  })

  it('never sends a password or its hash back', async () => {
    const { signIn } = await setup()

    const response = await signIn()

    expect(JSON.stringify(response.body)).not.toMatch(/password|hash|scrypt/i)
  })

  it('marks the cookie Secure when the API address is https', async () => {
    const { signIn } = await setup({ baseUrl: 'https://api.example.com' })

    const response = await signIn()

    expect(setCookies(response).join(' | ')).toMatch(/Secure/i)
  })

  it('leaves Secure off for a local http address, so local sign-in works', async () => {
    const { signIn } = await setup()

    const response = await signIn()

    expect(setCookies(response).join(' | ')).not.toMatch(/Secure/i)
  })

  it('keeps the session for 12 hours (D-99)', async () => {
    const { signIn, database } = await setup()

    await signIn()

    const expiresAt = Date.parse(String(database.session[0]?.['expiresAt']))
    expect(expiresAt - Date.now()).toBeGreaterThan((sessionSeconds - 5) * 1000)
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(sessionSeconds * 1000)
  })

  it('answers a wrong password and an unknown email alike, with no cookie', async () => {
    const { signIn } = await setup()

    const wrong = await signIn('not the password at all')
    const unknown = await signIn(testPassword, 'nobody@example.com')

    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
    expect(setCookies(wrong)).toEqual([])
    expect(setCookies(unknown)).toEqual([])
  })

  it('refuses a user an admin has banned, and ends the session they had', async () => {
    const { auth, app, signIn } = await setup()
    const director = await createTestUser(auth, { email: 'dee@example.com', role: 'director' })
    const open = await request(app)
      .post(signInPath)
      .send({ email: director.email, password: testPassword })
    const adminCookie = cookieOf(await signIn())

    await auth.api.banUser({
      body: { userId: director.id },
      headers: new Headers({ cookie: adminCookie }),
    })

    const again = await request(app)
      .post(signInPath)
      .send({ email: director.email, password: testPassword })
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieOf(open) }) })
    expect(again.status).toBe(403)
    expect(session).toBeNull()
  })

  it('refuses a sign-in sent from a page that is not trusted', async () => {
    const { app, user } = await setup({ trustedOrigins: ['https://app.example'] })

    const response = await request(app)
      .post(signInPath)
      .set('Origin', 'https://evil.example')
      .send({ email: user.email, password: testPassword })

    expect(response.status).toBe(403)
    expect(setCookies(response)).toEqual([])
  })

  it('accepts a sign-in sent from a trusted page', async () => {
    const { app, user } = await setup({ trustedOrigins: ['https://app.example'] })

    const response = await request(app)
      .post(signInPath)
      .set('Origin', 'https://app.example')
      .send({ email: user.email, password: testPassword })

    expect(response.status).toBe(200)
  })
})

describe('sign-in throttle', () => {
  it(`answers 429 after ${signInAttempts} failed attempts from one address`, async () => {
    const { signIn } = await setup()
    for (let attempt = 0; attempt < signInAttempts; attempt++) {
      expect((await signIn('wrong password here')).status).toBe(401)
    }

    const blocked = await signIn('wrong password here')

    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ message: 'Too many sign-in attempts. Try again later.' })
    expect(blocked.headers['retry-after']).toBeDefined()
  })

  it('sends the standard RateLimit header and not the old X-RateLimit ones', async () => {
    const { signIn } = await setup()

    const response = await signIn('wrong password here')

    expect(response.headers['ratelimit']).toBeDefined()
    expect(response.headers['x-ratelimit-limit']).toBeUndefined()
    expect(response.headers['x-ratelimit-remaining']).toBeUndefined()
  })

  it('also stops a correct password once the address is over the limit', async () => {
    const { signIn } = await setup()
    for (let attempt = 0; attempt < signInAttempts; attempt++) await signIn('wrong password here')

    expect((await signIn()).status).toBe(429)
  })

  it('counts only failures, so a desk behind one address can all sign in', async () => {
    const { signIn } = await setup()
    for (let attempt = 0; attempt < signInAttempts + 5; attempt++) {
      expect((await signIn()).status).toBe(200)
    }

    expect((await signIn('wrong password here')).status).toBe(401)
  })

  it('gives each client address its own count', async () => {
    const { auth } = await setup()
    const app = createTestApp({ auth, config: createConfig({ trustProxy: 1 }) })
    const attempt = (ip: string) =>
      request(app)
        .post(signInPath)
        .set('X-Forwarded-For', ip)
        .send({ email: 'ada@example.com', password: 'wrong password here' })
    for (let n = 0; n < signInAttempts; n++) await attempt('203.0.113.9')

    expect((await attempt('203.0.113.9')).status).toBe(429)
    expect((await attempt('203.0.113.10')).status).toBe(401)
  })
})

describe('sign-in logging and metrics', () => {
  it('logs a failed sign-in with its status, but without the email or the password', async () => {
    const { signIn, records } = await setup()

    await signIn('hunter2-hunter2-hunter2', 'secret.person@example.com')

    expect(records()).toContainEqual(
      expect.objectContaining({ msg: 'Sign-in failed', status: 401, level: 40 }),
    )
    const text = JSON.stringify(records())
    expect(text).toContain('Sign-in failed')
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('secret.person')
  })

  it('writes Better Auth’s own warnings to our log, marked with their source', async () => {
    const { signIn, records } = await setup()

    await signIn('not the password at all')

    expect(records()).toContainEqual(
      expect.objectContaining({ source: 'better-auth', msg: 'Auth library message' }),
    )
  })

  it('also logs a sign-in that Better Auth turns away as a bad request', async () => {
    const { app, records } = await setup()

    const response = await request(app)
      .post(signInPath)
      .send({ email: 'not-an-email', password: 'whatever password here' })

    expect(response.status).toBe(400)
    expect(records()).toContainEqual(
      expect.objectContaining({ msg: 'Sign-in failed', status: 400 }),
    )
  })

  it('does not log a successful sign-in as a failure', async () => {
    const { signIn, records } = await setup()

    await signIn()

    expect(JSON.stringify(records())).not.toContain('Sign-in failed')
  })

  async function metricSetup() {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
    const provider = new MeterProvider({
      readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })],
    })
    const { auth, user } = await setup()
    const app = createTestApp({ auth, meter: provider.getMeter('test') })
    const signIn = (password: string) =>
      request(app).post(signInPath).send({ email: user.email, password })
    async function count(reason: string): Promise<number> {
      await provider.forceFlush()
      const metric = exporter
        .getMetrics()
        .flatMap((data) => data.scopeMetrics)
        .flatMap((scope) => scope.metrics)
        .findLast((m) => m.descriptor.name === 'tournament_director.auth.failures')
      return (
        metric?.dataPoints
          .filter((point) => point.attributes['reason'] === reason)
          .reduce((sum, point) => sum + Number(point.value), 0) ?? 0
      )
    }
    return { signIn, count }
  }

  it('counts a sign-in turned away as a bad request too', async () => {
    const { signIn, count } = await metricSetup()

    await signIn('')

    expect(await count('bad_sign_in')).toBe(1)
  })

  it('counts each failed sign-in as bad_sign_in', async () => {
    const { signIn, count } = await metricSetup()

    await signIn('wrong password here')
    await signIn('wrong password here')
    await signIn(testPassword)

    expect(await count('bad_sign_in')).toBe(2)
  })

  it('counts each throttled sign-in as sign_in_throttled', async () => {
    const { signIn, count } = await metricSetup()
    for (let attempt = 0; attempt < signInAttempts + 2; attempt++)
      await signIn('wrong password here')

    expect(await count('sign_in_throttled')).toBe(2)
  })
})

describe('POST /v1/auth/sign-out', () => {
  const origin = 'https://app.example'

  it('ends the session and clears the cookie', async () => {
    const { app, auth, signIn } = await setup({ trustedOrigins: [origin] })
    const cookie = cookieOf(await signIn())

    const response = await request(app)
      .post('/v1/auth/sign-out')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({})

    expect(response.status).toBe(200)
    expect(setCookies(response).join(' | ')).toMatch(/Max-Age=0/i)
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it('refuses a request that carries the cookie from a page that is not trusted', async () => {
    const { app, auth, signIn } = await setup({ trustedOrigins: [origin] })
    const cookie = cookieOf(await signIn())

    const response = await request(app)
      .post('/v1/auth/sign-out')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({})

    expect(response.status).toBe(403)
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).not.toBeNull()
  })

  it('refuses a request that carries the cookie and no Origin header', async () => {
    const { app, signIn } = await setup({ trustedOrigins: [origin] })
    const cookie = cookieOf(await signIn())

    const response = await request(app).post('/v1/auth/sign-out').set('Cookie', cookie).send({})

    expect(response.status).toBe(403)
  })
})

describe('Better Auth paths we do not open', () => {
  it.each([
    ['post', '/v1/auth/sign-up/email'],
    ['get', '/v1/auth/get-session'],
    ['post', '/v1/auth/change-password'],
    ['post', '/v1/auth/update-user'],
    ['post', '/v1/auth/delete-user'],
    ['get', '/v1/auth/list-sessions'],
    ['get', '/v1/auth/admin/list-users'],
    ['post', '/v1/auth/admin/create-user'],
    ['post', '/v1/auth/admin/impersonate-user'],
    ['post', '/v1/auth/admin/set-role'],
  ] as const)('answers 404 to %s %s, even for a signed-in admin', async (method, path) => {
    const { app, database, signIn } = await setup()
    const cookie = cookieOf(await signIn())
    const usersBefore = database.user.length

    const response = await request(app)[method](path).set('Cookie', cookie).send({
      email: 'new@example.com',
      password: testPassword,
      name: 'New',
      role: 'admin',
    })

    expect(response.status).toBe(404)
    expect(database.user).toHaveLength(usersBefore)
  })

  it('answers 404 to sign-in with the wrong method', async () => {
    const { app } = await setup()

    expect((await request(app).get(signInPath)).status).toBe(404)
  })
})
