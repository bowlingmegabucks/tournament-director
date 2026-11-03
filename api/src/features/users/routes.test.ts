import request from 'supertest'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { apiKeyHeader } from '../../shared/auth/caller.ts'
import { roleNames } from '../../shared/auth/roles.ts'
import type { Mailer } from '../../shared/mail/mailer.ts'
import { testApiKey } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestApp } from '../../test/testApp.ts'
import {
  createTestAuth,
  createTestUser,
  databaseUnavailableError,
  signInCookie,
} from '../../test/testAuth.ts'
import type { RoleName } from '../../shared/auth/roles.ts'
import { createInviteMailer } from './inviteMail.ts'

const webBaseUrl = 'https://example.com/tournament-director'
const newUser = { email: 'Bea@Example.com', name: 'Bea Bowler', roles: ['scoreKeeper'] }

async function setup({
  role = 'admin',
  mail = true,
  send = vi.fn<Mailer['send']>().mockResolvedValue(undefined),
}: { role?: RoleName; mail?: boolean; send?: Mock<Mailer['send']> } = {}) {
  const captured = createCapturedLogger()
  const invites = createInviteMailer({ send }, webBaseUrl, captured.logger)
  const { auth, database, outage } = createTestAuth({
    logger: captured.logger,
    sendResetPassword: invites.deliver,
  })
  const caller = await createTestUser(auth, { role })
  const cookie = await signInCookie(auth, caller.email)
  const app = createTestApp({
    auth,
    logger: captured.logger,
    invites: mail ? invites : undefined,
  })
  const add = (body: unknown = newUser) =>
    request(app)
      .post('/v1/users')
      .set('Cookie', cookie)
      .send(body as object)
  return { app, auth, database, outage, send, cookie, add, records: captured.records }
}

describe('access to /v1/users', () => {
  it('answers 401 to someone who is signed out', async () => {
    const { app } = await setup()

    expect((await request(app).post('/v1/users').send(newUser)).status).toBe(401)
    expect((await request(app).get('/v1/users/options')).status).toBe(401)
  })

  it.each<RoleName>(['director', 'scoreKeeper'])('answers 403 to a %s', async (role) => {
    const { add, send } = await setup({ role })

    const response = await add()

    expect(response.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('answers 403 to the API key, which holds no permission here (D-96)', async () => {
    const { app, send } = await setup()

    const response = await request(app)
      .post('/v1/users')
      .set(apiKeyHeader, testApiKey)
      .send(newUser)

    expect(response.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('GET /v1/users/options', () => {
  it('lists every role and says email is on, without caching', async () => {
    const { app, cookie } = await setup()

    const response = await request(app).get('/v1/users/options').set('Cookie', cookie)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ roles: roleNames, inviteEmail: true })
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('says email is off when the API has no mail settings', async () => {
    const { app, cookie } = await setup({ mail: false })

    const response = await request(app).get('/v1/users/options').set('Cookie', cookie)

    expect(response.body).toEqual({ roles: roleNames, inviteEmail: false })
  })
})

describe('POST /v1/users', () => {
  it('adds the user, emails a set-password link, and answers 201 with no password or token', async () => {
    const { add, send, database } = await setup()

    const response = await add({ ...newUser, roles: ['director', 'scoreKeeper'] })

    expect(response.status).toBe(201)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body).toEqual({
      id: expect.any(String) as string,
      email: 'bea@example.com',
      name: 'Bea Bowler',
      roles: ['director', 'scoreKeeper'],
    })
    expect(send).toHaveBeenCalledTimes(1)
    const message = send.mock.calls[0]?.[0]
    expect(message?.to).toBe('bea@example.com')
    expect(message?.text).toMatch(
      new RegExp(`${webBaseUrl}/set-password\\?token=[\\w-]+`.replaceAll('/', '\\/')),
    )
    const stored = database.user.find((user) => user.email === 'bea@example.com')
    expect(stored?.role).toBe('director,scoreKeeper')
    expect(JSON.stringify(response.body)).not.toMatch(/password|token/i)
  })

  it('gives the user a credential account the invite can replace', async () => {
    const { add, database } = await setup()

    await add()

    expect(database.account.filter((account) => account.providerId === 'credential')).toHaveLength(
      2,
    )
  })

  it('drops a repeated role', async () => {
    const { add } = await setup()

    const response = await add({ ...newUser, roles: ['director', 'director'] })

    expect(response.body).toMatchObject({ roles: ['director'] })
  })

  it('answers 409 for an email already in use, and sends nothing', async () => {
    const { add, send } = await setup()
    await add()
    send.mockClear()

    const response = await add({ ...newUser, email: 'BEA@example.com' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'A user with this email already exists.' })
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['no roles (D-103)', { ...newUser, roles: [] }],
    ['a role that does not exist', { ...newUser, roles: ['owner'] }],
    ['no roles field', { email: 'a@b.co', name: 'A' }],
    ['a bad email', { ...newUser, email: 'not-an-email' }],
    ['a blank name', { ...newUser, name: '   ' }],
    ['an empty object', {}],
  ])('answers 400 for %s, and adds no one', async (_label, body) => {
    const { add, send, database } = await setup()

    const response = await add(body)

    expect(response.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
    expect(database.user).toHaveLength(1)
  })

  it('answers 400 for a body that is not JSON', async () => {
    const { app, cookie } = await setup()

    const response = await request(app)
      .post('/v1/users')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{nope')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
  })

  it('answers 503 and adds no one when the API has no mail settings', async () => {
    const { add, database } = await setup({ mail: false })

    const response = await add()

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      message: 'Email is not set up on the server, so no invite can be sent.',
    })
    expect(database.user).toHaveLength(1)
  })

  it('removes the user and answers 502 when the email fails, so a retry works', async () => {
    const send = vi.fn<Mailer['send']>().mockRejectedValueOnce(new Error('535 bad login'))
    const { add, database } = await setup({ send })

    const failed = await add()

    expect(failed.status).toBe(502)
    expect(failed.body).toEqual({
      message: 'The invite email could not be sent, so the user was not added. Try again.',
    })
    expect(database.user).toHaveLength(1)
    expect((await add()).status).toBe(201)
  })

  it('answers 502 and logs the user id when the failed invite cannot be undone', async () => {
    const send = vi.fn<Mailer['send']>().mockRejectedValue(new Error('535 bad login'))
    const { add, auth, records } = await setup({ send })
    vi.spyOn(auth.api, 'removeUser').mockRejectedValue(new Error('boom'))

    const response = await add()

    expect(response.status).toBe(502)
    expect(response.body.message).toContain('the user could not be removed')
    expect(records()).toContainEqual(
      expect.objectContaining({
        msg: 'Could not remove a user whose invite failed',
        userId: expect.any(String) as string,
      }),
    )
  })

  it('answers 503 when the database is down', async () => {
    const { add, outage } = await setup()
    outage.start(databaseUnavailableError())

    const response = await add()

    expect(response.status).toBe(503)
  })

  it('logs the new user id and roles, never the email or the link', async () => {
    const { add, records } = await setup()

    await add()

    const line = records().find((record) => record.msg === 'User added')
    expect(line).toMatchObject({ roles: ['scoreKeeper'] })
    const logged = JSON.stringify(records())
    expect(logged).not.toContain('bea@example.com')
    expect(logged).not.toContain('set-password')
  })
})
