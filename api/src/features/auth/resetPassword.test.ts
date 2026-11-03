import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { maxPasswordLength, minPasswordLength } from '../../shared/auth/createAuth.ts'
import { signInAttempts } from '../../shared/auth/signInLimit.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createTestAuth, createTestUser, testPassword } from '../../test/testAuth.ts'

const resetPath = '/v1/auth/reset-password'
const signInPath = '/v1/auth/sign-in/email'
const newPassword = 'a brand new password 42'

// A user with a reset token, as an invite makes one (the mail is replaced by a list of tokens).
async function setup() {
  const captured = createCapturedLogger()
  const tokens: string[] = []
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const provider = new MeterProvider({
    readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })],
  })
  const { auth, database, outage } = createTestAuth({
    logger: captured.logger,
    sendResetPassword: ({ token }) => {
      tokens.push(token)
      return Promise.resolve()
    },
  })
  const user = await createTestUser(auth, { email: 'bea@example.com', role: 'scoreKeeper' })
  await auth.api.requestPasswordReset({ body: { email: user.email } })
  const app = createTestApp({ auth, logger: captured.logger, meter: provider.getMeter('test') })
  const token = tokens[0] ?? ''
  /** How many refused calls the failure counter holds for this reason. */
  const count = async (reason: string): Promise<number> => {
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
  const reset = (body: object) => request(app).post(resetPath).send(body)
  const signIn = (password: string) =>
    request(app).post(signInPath).send({ email: user.email, password })
  return {
    app,
    auth,
    database,
    outage,
    user,
    token,
    reset,
    signIn,
    count,
    records: captured.records,
  }
}

describe('POST /v1/auth/reset-password', () => {
  it('sets the password: the new one signs in and the old one does not', async () => {
    const { reset, signIn, token } = await setup()

    const response = await reset({ newPassword, token })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: true })
    expect(response.headers['cache-control']).toBe('no-store')
    expect((await signIn(newPassword)).status).toBe(200)
    expect((await signIn(testPassword)).status).toBe(401)
  })

  it('works once: the same token again is a 400', async () => {
    const { reset, token } = await setup()
    await reset({ newPassword, token })

    const again = await reset({ newPassword: 'another password 4242', token })

    expect(again.status).toBe(400)
    expect(again.body).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('ends the sessions the user already had', async () => {
    const { reset, signIn, token, database } = await setup()
    await signIn(testPassword)
    expect(database.session).toHaveLength(1)

    await reset({ newPassword, token })

    expect(database.session).toHaveLength(0)
  })

  it('refuses an unknown token', async () => {
    const { reset, signIn } = await setup()

    const response = await reset({ newPassword, token: 'not-a-real-token' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ code: 'INVALID_TOKEN' })
    expect((await signIn(testPassword)).status).toBe(200)
  })

  it('refuses an expired token', async () => {
    const { reset, database, token } = await setup()
    const row = database.verification.find((value) => String(value['identifier']).endsWith(token))
    if (row) row['expiresAt'] = new Date(Date.now() - 1000)

    const response = await reset({ newPassword, token })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('refuses a call with no token', async () => {
    const { reset } = await setup()

    expect((await reset({ newPassword })).status).toBe(400)
  })

  it.each([
    ['short', 'x'.repeat(minPasswordLength - 1)],
    ['long', 'x'.repeat(maxPasswordLength + 1)],
  ])('refuses a password that is too %s, and keeps the token usable', async (_label, password) => {
    const { reset, token } = await setup()

    const refused = await reset({ newPassword: password, token })

    expect(refused.status).toBe(400)
    expect((await reset({ newPassword, token })).status).toBe(200)
  })

  it('refuses a token in the address, and changes nothing', async () => {
    const { app, token, signIn } = await setup()

    const response = await request(app).post(`${resetPath}?token=${token}`).send({ newPassword })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Send the token in the request body, not the address.',
    })
    expect((await signIn(testPassword)).status).toBe(200)
  })

  it('throttles refused calls apart from sign-in', async () => {
    const { reset, signIn } = await setup()
    for (let attempt = 0; attempt < signInAttempts; attempt++) {
      expect((await reset({ newPassword, token: `guess-${attempt}` })).status).toBe(400)
    }

    const throttled = await reset({ newPassword, token: 'one-more-guess' })

    expect(throttled.status).toBe(429)
    expect(throttled.body).toEqual({
      message: 'Too many attempts to set a password. Try again later.',
    })
    expect((await signIn(testPassword)).status).toBe(200)
  })

  it('logs a refused call without the token or the password', async () => {
    const { reset, records } = await setup()

    await reset({ newPassword, token: 'secret-guess-token' })

    const logged = JSON.stringify(records())
    expect(logged).toContain('Set-password failed')
    expect(logged).not.toContain('secret-guess-token')
    expect(logged).not.toContain(newPassword)
  })

  it('logs a refused call at warn level with its status', async () => {
    const { reset, records } = await setup()

    await reset({ newPassword, token: 'not-a-real-token' })

    expect(records()).toContainEqual(
      expect.objectContaining({ msg: 'Set-password failed', status: 400, level: 40 }),
    )
  })

  it('counts each refused call as bad_reset, and a good call as nothing', async () => {
    const { reset, count } = await setup()

    await reset({ newPassword, token: 'guess-1' })
    await reset({ newPassword, token: 'guess-2' })
    const good = await reset({ newPassword, token: (await setup()).token })

    expect(good.status).toBe(400) // another setup's token is not this app's
    expect(await count('bad_reset')).toBe(3)
  })

  it('neither logs nor counts a call that worked', async () => {
    const { reset, count, records, token } = await setup()

    expect((await reset({ newPassword, token })).status).toBe(200)

    expect(JSON.stringify(records())).not.toContain('Set-password failed')
    expect(await count('bad_reset')).toBe(0)
  })

  it.each([
    ['a database outage (503)', undefined],
    ['a plain 500', new Error('something odd')],
  ])('neither logs nor counts %s as a refused call', async (_label, error) => {
    const { reset, outage, count, records, token } = await setup()
    outage.start(error)

    const response = await reset({ newPassword, token })

    expect(response.status).toBe(error ? 500 : 503)
    expect(JSON.stringify(records())).not.toContain('Set-password failed')
    expect(await count('bad_reset')).toBe(0)
  })

  it('keeps the callback and verification paths closed', async () => {
    const { app, user } = await setup()

    for (const path of ['/v1/auth/reset-password/abc', '/v1/auth/send-verification-email']) {
      const response = await request(app).post(path).send({ email: user.email })
      expect(response.status).toBe(404)
    }
    expect((await request(app).get('/v1/auth/reset-password/abc')).status).toBe(404)
  })
})
