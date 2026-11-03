import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import { APIError } from 'better-auth/api'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { passwordChangeAttempts } from '../../shared/auth/signInLimit.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createTestAuth, createTestUser, signInCookie, testPassword } from '../../test/testAuth.ts'

const newPassword = 'a brand new passphrase'

async function setup({ role }: { role?: 'admin' | 'director' | 'scoreKeeper' } = {}) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const provider = new MeterProvider({
    readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })],
  })
  /** Count per reason, from `tournament_director.auth.failures`. */
  const failures = async (): Promise<Record<string, number>> => {
    await provider.forceFlush()
    const metric = exporter
      .getMetrics()
      .flatMap((data) => data.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .findLast((m) => m.descriptor.name === 'tournament_director.auth.failures')
    const counts: Record<string, number> = {}
    for (const point of metric?.dataPoints ?? []) {
      counts[String(point.attributes['reason'])] = Number(point.value)
    }
    return counts
  }
  const captured = createCapturedLogger()
  const { auth, outage } = createTestAuth({ logger: captured.logger })
  const user = await createTestUser(auth, { role, name: 'Dee Director' })
  const cookie = await signInCookie(auth, user.email)
  const app = createTestApp({ auth, logger: captured.logger, meter: provider.getMeter('test') })
  const change = (body: unknown, as: string = cookie) =>
    request(app)
      .post('/v1/account/password')
      .set('Cookie', as)
      .send(body as object)
  const rename = (body: unknown) =>
    request(app)
      .patch('/v1/account')
      .set('Cookie', cookie)
      .send(body as object)
  const me = (as: string = cookie) => request(app).get('/v1/me').set('Cookie', as)
  return {
    app,
    auth,
    outage,
    user,
    cookie,
    change,
    rename,
    me,
    failures,
    records: captured.records,
  }
}

describe('access to /v1/account', () => {
  it('answers 401 to someone who is signed out', async () => {
    const { app } = await setup()

    expect((await request(app).post('/v1/account/password').send({})).status).toBe(401)
    expect((await request(app).patch('/v1/account').send({ name: 'X' })).status).toBe(401)
  })

  it('does not let the API key in', async () => {
    const { app } = await setup()

    const response = await request(app)
      .post('/v1/account/password')
      .set(apiKeyHeader, testApiKey)
      .send({})

    expect(response.status).toBe(403)
  })

  it('lets a user with no role in', async () => {
    const { auth, app } = await setup()
    await auth.api.createUser({
      body: { email: 'nora@example.com', password: testPassword, name: 'Nora None', role: [] },
    })
    const cookie = await signInCookie(auth, 'nora@example.com')

    const response = await request(app)
      .patch('/v1/account')
      .set('Cookie', cookie)
      .send({ name: 'Nora N' })

    expect(response.status).toBe(200)
  })
})

describe('POST /v1/account/password', () => {
  it.each(['admin', 'director', 'scoreKeeper'] as const)('lets a %s change it', async (role) => {
    const { change } = await setup({ role })

    const response = await change({ currentPassword: testPassword, newPassword })

    expect(response.status).toBe(204)
  })

  it('signs in with the new password and not the old one', async () => {
    const { change, auth, user } = await setup()
    await change({ currentPassword: testPassword, newPassword })

    await expect(signInCookie(auth, user.email, newPassword)).resolves.not.toBe('')
    const old = await auth.api.signInEmail({
      body: { email: user.email, password: testPassword },
      asResponse: true,
    })
    expect(old.status).toBe(401)
  })

  it('ends the other sessions and keeps this one', async () => {
    const { change, auth, user, me, cookie } = await setup()
    const other = await signInCookie(auth, user.email)

    const response = await change({ currentPassword: testPassword, newPassword })
    const fresh = response.headers['set-cookie'] as string[] | undefined

    expect((await me(other)).body.user).toBeNull()
    // The browser gets a cookie for the new session, and it works.
    expect(fresh?.length).toBeGreaterThan(0)
    const next = (fresh ?? []).map((line) => line.split(';')[0]).join('; ')
    expect((await me(next)).body.user).not.toBeNull()
    expect(cookie).not.toBe(next)
  })

  it('answers 400 and changes nothing when the current password is wrong', async () => {
    const { change, auth, user } = await setup()

    const response = await change({ currentPassword: 'not the password', newPassword })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The current password is wrong.' })
    await expect(signInCookie(auth, user.email)).resolves.not.toBe('')
  })

  it('answers 400 when the new password equals the current one', async () => {
    const { change } = await setup()

    const response = await change({ currentPassword: testPassword, newPassword: testPassword })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Choose a password you have not used just now.' })
  })

  it('counts a wrong current password as a failure, and a throttled call as another', async () => {
    const { change, failures } = await setup()
    for (let i = 0; i < passwordChangeAttempts; i++) {
      await change({ currentPassword: 'wrong', newPassword })
    }
    await change({ currentPassword: 'wrong', newPassword })

    expect(await failures()).toEqual({ bad_password_change: 10, password_change_throttled: 1 })
  })

  it('does not call another Better Auth refusal a wrong password', async () => {
    const { change, auth, failures } = await setup()
    vi.spyOn(auth.api, 'changePassword').mockRejectedValue(
      new APIError('BAD_REQUEST', { message: 'Something else', code: 'SOMETHING_ELSE' }),
    )

    const response = await change({ currentPassword: testPassword, newPassword })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The password could not be changed.' })
    expect(await failures()).toEqual({})
  })

  it('answers 401 when Better Auth finds the session gone', async () => {
    const { change, auth } = await setup()
    vi.spyOn(auth.api, 'changePassword').mockRejectedValue(new APIError('UNAUTHORIZED'))

    const response = await change({ currentPassword: testPassword, newPassword })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ message: 'Missing or invalid credentials.' })
  })

  it('leaves a server-side failure of Better Auth to the error handler', async () => {
    const { change, rename, auth } = await setup()
    vi.spyOn(auth.api, 'changePassword').mockRejectedValue(new APIError('INTERNAL_SERVER_ERROR'))
    vi.spyOn(auth.api, 'updateUser').mockRejectedValue(new Error('boom'))

    expect((await change({ currentPassword: testPassword, newPassword })).status).toBe(500)
    expect((await rename({ name: 'X' })).status).toBe(500)
  })

  it('does not count input mistakes as password guesses', async () => {
    const { change } = await setup()
    for (let i = 0; i < passwordChangeAttempts; i++) {
      expect((await change({ currentPassword: testPassword, newPassword: 'short' })).status).toBe(
        400,
      )
      expect(
        (await change({ currentPassword: testPassword, newPassword: testPassword })).status,
      ).toBe(400)
    }

    const response = await change({ currentPassword: testPassword, newPassword })

    expect(response.status).toBe(204)
  })

  it('refuses a disabled user, who is signed out', async () => {
    const { change, rename, auth, user } = await setup()
    const admin = await createTestUser(auth, { email: 'boss@example.com', name: 'Boss' })
    const adminCookie = await signInCookie(auth, admin.email)
    await auth.api.banUser({
      body: { userId: user.id },
      headers: new Headers({ cookie: adminCookie }),
    })

    expect((await change({ currentPassword: testPassword, newPassword })).status).toBe(401)
    expect((await rename({ name: 'Still Here' })).status).toBe(401)
  })

  it('never lets a browser or proxy keep the answer', async () => {
    const { change } = await setup()

    const response = await change({ currentPassword: testPassword, newPassword })

    expect(response.headers['cache-control']).toBe('no-store')
  })

  it.each([
    ['too short', 'short'],
    ['too long', 'x'.repeat(129)],
  ])('answers 400 when the new password is %s', async (_name, value) => {
    const { change } = await setup()

    expect((await change({ currentPassword: testPassword, newPassword: value })).status).toBe(400)
  })

  it('answers 400 for a missing field', async () => {
    const { change } = await setup()

    expect((await change({ newPassword })).status).toBe(400)
  })

  it('throttles wrong attempts per user, then refuses even the right password', async () => {
    const { change } = await setup()
    for (let i = 0; i < passwordChangeAttempts; i++) {
      expect((await change({ currentPassword: 'wrong', newPassword })).status).toBe(400)
    }

    const response = await change({ currentPassword: testPassword, newPassword })

    expect(response.status).toBe(429)
    expect(response.body).toEqual({
      message: 'Too many attempts to change the password. Try again later.',
    })
  })

  it('counts attempts per user, not per address', async () => {
    const { change, auth } = await setup()
    await createTestUser(auth, { email: 'sam@example.com', name: 'Sam' })
    const sam = await signInCookie(auth, 'sam@example.com')
    for (let i = 0; i < passwordChangeAttempts; i++) {
      await change({ currentPassword: 'wrong', newPassword })
    }

    const response = await change({ currentPassword: testPassword, newPassword }, sam)

    expect(response.status).toBe(204)
  })

  it('logs the user id and no password', async () => {
    const { change, user, records } = await setup()
    await change({ currentPassword: 'wrong password!!', newPassword })
    await change({ currentPassword: testPassword, newPassword })

    const lines = records()
    expect(lines).toContainEqual(
      expect.objectContaining({ msg: 'Password change refused', userId: user.id }),
    )
    expect(lines).toContainEqual(
      expect.objectContaining({ msg: 'Password changed', userId: user.id }),
    )
    const text = JSON.stringify(lines)
    expect(text).not.toContain(newPassword)
    expect(text).not.toContain(testPassword)
    expect(text).not.toContain('wrong password!!')
  })

  it('answers 503 when the database cannot be reached', async () => {
    const { change, outage } = await setup()
    outage.start()

    const response = await change({ currentPassword: testPassword, newPassword })

    expect(response.status).toBe(503)
  })
})

describe('PATCH /v1/account', () => {
  it('saves a trimmed name that /v1/me then shows', async () => {
    const { rename, me } = await setup()

    const response = await rename({ name: '  Dee D  ' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ name: 'Dee D' })
    expect((await me()).body.user.name).toBe('Dee D')
  })

  it.each([
    ['empty', { name: '   ' }],
    ['too long', { name: 'x'.repeat(101) }],
    ['missing', {}],
  ])('answers 400 for a name that is %s', async (_label, body) => {
    const { rename } = await setup()

    expect((await rename(body)).status).toBe(400)
  })

  it.each([
    ['role', { name: 'Dee', role: 'admin' }],
    ['banned', { name: 'Dee', banned: false }],
    ['email', { name: 'Dee', email: 'new@example.com' }],
  ])('refuses a body that also sets %s', async (_label, body) => {
    const { rename, me, user } = await setup({ role: 'scoreKeeper' })

    const response = await rename(body)

    expect(response.status).toBe(400)
    const after = (await me()).body.user
    expect(after.roles).toEqual(['scoreKeeper'])
    expect(after.name).toBe('Dee Director')
    expect(after.email).toBe(user.email)
  })

  it('does not open the library paths', async () => {
    const { app, cookie } = await setup()

    for (const path of ['/v1/auth/update-user', '/v1/auth/change-password']) {
      const response = await request(app)
        .post(path)
        .set('Cookie', cookie)
        .send({ name: 'X', role: 'admin' })
      expect(response.status).toBe(404)
    }
  })

  it('answers 401 when Better Auth finds the session gone, and 400 for any other refusal', async () => {
    const { rename, auth } = await setup()
    const update = vi.spyOn(auth.api, 'updateUser')
    update.mockRejectedValueOnce(new APIError('UNAUTHORIZED'))
    update.mockRejectedValueOnce(new APIError('BAD_REQUEST', { message: 'library text' }))

    expect((await rename({ name: 'X' })).status).toBe(401)
    const other = await rename({ name: 'X' })
    expect(other.status).toBe(400)
    expect(other.body).toEqual({ message: 'The name could not be saved.' })
  })

  it('logs the user id', async () => {
    const { rename, user, records } = await setup()
    await rename({ name: 'Dee D' })

    expect(records()).toContainEqual(
      expect.objectContaining({ msg: 'Profile changed', userId: user.id }),
    )
  })
})
