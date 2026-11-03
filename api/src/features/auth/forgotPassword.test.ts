import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgotAttempts } from '../../shared/auth/signInLimit.ts'
import type { Mailer } from '../../shared/mail/mailer.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createTestAuth, createTestUser, testPassword } from '../../test/testAuth.ts'
import { createInviteMailer } from '../users/inviteMail.ts'

const path = '/v1/auth/request-password-reset'
const webBaseUrl = 'https://example.com/tournament-director'

async function setup({
  mail = true,
  send = vi.fn<Mailer['send']>().mockResolvedValue(undefined),
} = {}) {
  const captured = createCapturedLogger()
  const invites = createInviteMailer({ send }, webBaseUrl, captured.logger)
  const { auth, database } = createTestAuth({
    logger: captured.logger,
    sendResetPassword: invites.deliver,
  })
  const user = await createTestUser(auth, { email: 'bea@example.com', role: 'scoreKeeper' })
  const app = createTestApp({ auth, logger: captured.logger, invites: mail ? invites : undefined })
  const forgot = (email: unknown = user.email) => request(app).post(path).send({ email })
  return { app, auth, database, user, send, forgot, records: captured.records }
}

// The mail is sent after the answer, so let it finish before looking.
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('POST /v1/auth/request-password-reset', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emails a link to the set-password page, in the reset wording', async () => {
    const { forgot, send } = await setup()

    const response = await forgot()
    await settle()

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: true })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(send).toHaveBeenCalledTimes(1)
    const message = send.mock.calls[0]?.[0]
    expect(message?.to).toBe('bea@example.com')
    expect(message?.subject).toBe('Reset your Tournament Director password')
    expect(message?.text).toContain(`${webBaseUrl}/set-password?token=`)
  })

  it('lets the link choose a new password', async () => {
    const { app, forgot, send } = await setup()
    await forgot()
    await settle()
    const token = /token=([\w-]+)/.exec(send.mock.calls[0]?.[0].text ?? '')?.[1]

    const reset = await request(app)
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'a brand new password 42' })

    expect(reset.status).toBe(200)
    const signIn = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'bea@example.com', password: 'a brand new password 42' })
    expect(signIn.status).toBe(200)
    expect(testPassword).not.toBe('a brand new password 42')
  })

  it('answers an unknown email exactly like a known one, and sends nothing', async () => {
    const { forgot, send } = await setup()

    const known = await forgot()
    const unknown = await forgot('nobody@example.com')
    await settle()

    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not wait for the mail, so a slow server does not show who has an account', async () => {
    const send = vi.fn<Mailer['send']>().mockReturnValue(new Promise(() => undefined))
    const { forgot } = await setup({ send })

    const response = await forgot()

    expect(response.status).toBe(200)
  })

  it('still answers 200 when the mail fails, and logs it', async () => {
    const send = vi.fn<Mailer['send']>().mockRejectedValue(new Error('535 bad login'))
    const { forgot, records } = await setup({ send })

    const response = await forgot()
    await settle()

    expect(response.status).toBe(200)
    expect(JSON.stringify(records())).toContain('Password reset email failed')
  })

  it('sends one email for repeat requests within a minute', async () => {
    const { forgot, send } = await setup()

    const first = await forgot()
    const second = await forgot('BEA@example.com')
    await settle()

    expect(second.body).toEqual(first.body)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('trims the address, and treats a different case as the same address', async () => {
    const { forgot, send } = await setup()

    expect((await forgot('  BEA@Example.com  ')).status).toBe(200)
    expect((await forgot('bea@example.com')).status).toBe(200)
    await settle()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('refuses an address longer than 254 characters', async () => {
    const { forgot, send } = await setup()
    const long = `a@${`${'b'.repeat(60)}.`.repeat(5)}com`

    const response = await forgot(long)

    expect(long.length).toBeGreaterThan(254)
    expect(response.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses a body over 10 kb', async () => {
    const { forgot } = await setup()

    const response = await forgot(`${'a'.repeat(11_000)}@example.com`)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is too large.' })
  })

  it.each([['not-an-email'], [''], [null], [42]])('answers 400 for the email %j', async (email) => {
    const { forgot, send } = await setup()

    const response = await forgot(email)

    expect(response.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('answers 503 when the API has no mail settings', async () => {
    const { forgot } = await setup({ mail: false })

    const response = await forgot()

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      message: 'Email is not set up on the server, so no link can be sent.',
    })
  })

  it('throttles every request, known email or not', async () => {
    const { forgot, send } = await setup()
    for (let attempt = 0; attempt < forgotAttempts; attempt++) {
      expect((await forgot(`person${attempt}@example.com`)).status).toBe(200)
    }

    const throttled = await forgot()

    expect(throttled.status).toBe(429)
    expect(throttled.body).toEqual({
      message: 'Too many password reset requests. Try again later.',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('logs neither the email nor the link', async () => {
    const { forgot, records } = await setup()

    await forgot()
    await settle()

    const logged = JSON.stringify(records())
    expect(logged).not.toContain('bea@example.com')
    expect(logged).not.toContain('set-password')
  })

  it('sends again once a minute has passed, and not a moment before', async () => {
    const { forgot, send } = await setup()
    const start = Date.now()
    const clock = vi.spyOn(Date, 'now')

    clock.mockReturnValue(start)
    await forgot()
    clock.mockReturnValue(start + 59_999)
    await forgot()
    await settle()
    expect(send).toHaveBeenCalledTimes(1)

    clock.mockReturnValue(start + 60_000)
    await forgot()
    await settle()
    expect(send).toHaveBeenCalledTimes(2)
  })
})
