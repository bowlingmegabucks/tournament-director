import { prismaAdapter } from 'better-auth/adapters/prisma'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'
import { createAuth, createInviteExtender } from '../../shared/auth/createAuth.ts'
import { createDatabaseClient, type PrismaClient } from '../../shared/database.ts'
import type { Mailer } from '../../shared/mail/mailer.ts'
import { createConfig } from '../../test/factories.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createTestApp } from '../../test/testApp.ts'
import { createTestUser, signInCookie, testPassword } from '../../test/testAuth.ts'
import { createInviteMailer } from './inviteMail.ts'

// The user routes on the real Prisma adapter and MariaDB tables. The memory tests in routes.test.ts
// cover the rules; these prove the queries (sort, filter, columns) and the transactions behave the
// same on the database that production uses (USR-01 to USR-22).
describe('user routes on MariaDB', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
  })

  async function setup(send = vi.fn<Mailer['send']>().mockResolvedValue(undefined)) {
    const captured = createCapturedLogger()
    const invites = createInviteMailer(
      { send },
      'https://example.com/td',
      captured.logger,
      createInviteExtender(() => auth),
    )
    const auth = createAuth({
      config: createConfig().auth,
      database: prismaAdapter(client, { provider: 'mysql' }),
      trustedOrigins: [],
      logger: captured.logger,
      sendResetPassword: invites.deliver,
    })
    const admin = await createTestUser(auth, { email: 'ada@example.com', name: 'Ada' })
    const cookie = await signInCookie(auth, admin.email)
    const app = createTestApp({ auth, logger: captured.logger, invites })
    const as = (cookieHeader = cookie) => ({
      list: () => request(app).get('/v1/users').set('Cookie', cookieHeader),
      add: (body: object) => request(app).post('/v1/users').set('Cookie', cookieHeader).send(body),
      reset: (id: string) =>
        request(app).post(`/v1/users/${id}/password-reset`).set('Cookie', cookieHeader),
      disable: (id: string) =>
        request(app).post(`/v1/users/${id}/disable`).set('Cookie', cookieHeader),
      enable: (id: string) =>
        request(app).post(`/v1/users/${id}/enable`).set('Cookie', cookieHeader),
      patch: (id: string, body: object) =>
        request(app).patch(`/v1/users/${id}`).set('Cookie', cookieHeader).send(body),
    })
    return { app, auth, admin, cookie, send, ...as() }
  }

  /** The token in the link of the last mail sent. */
  const tokenSentBy = (send: ReturnType<typeof vi.fn<Mailer['send']>>): string => {
    const message = send.mock.lastCall?.[0]
    const match = /token=([^\s"&]+)/.exec(message?.text ?? '')
    return decodeURIComponent(match?.[1] ?? '')
  }

  it('lists users by name, with their roles and whether they are disabled', async () => {
    const { auth, list } = await setup()
    await createTestUser(auth, { email: 'zed@example.com', name: 'Zed', role: 'director' })
    const bea = await createTestUser(auth, {
      email: 'bea@example.com',
      name: 'Bea',
      role: 'scoreKeeper',
    })
    await client.user.update({ where: { id: bea.id }, data: { banned: true } })

    const response = await list()

    expect(response.status).toBe(200)
    expect(response.body.users).toEqual([
      {
        id: expect.any(String),
        email: 'ada@example.com',
        name: 'Ada',
        roles: ['admin'],
        disabled: false,
      },
      { id: bea.id, email: 'bea@example.com', name: 'Bea', roles: ['scoreKeeper'], disabled: true },
      {
        id: expect.any(String),
        email: 'zed@example.com',
        name: 'Zed',
        roles: ['director'],
        disabled: false,
      },
    ])
  })

  it('adds a user with a role, a credential account, no session, and one invite mail', async () => {
    const { add, send } = await setup()

    const response = await add({
      email: 'Bea@Example.com',
      name: 'Bea',
      roles: ['director', 'scoreKeeper'],
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      email: 'bea@example.com',
      roles: ['director', 'scoreKeeper'],
    })
    const stored = await client.user.findUniqueOrThrow({ where: { email: 'bea@example.com' } })
    expect(stored).toMatchObject({ banned: false, role: 'director,scoreKeeper' })
    const account = await client.account.findFirstOrThrow({ where: { userId: stored.id } })
    expect(account.providerId).toBe('credential')
    expect(await client.session.count({ where: { userId: stored.id } })).toBe(0)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.lastCall?.[0].to).toBe('bea@example.com')
  })

  it('answers 409 for a second user with the same email and adds nothing', async () => {
    const { add, send } = await setup()
    await add({ email: 'bea@example.com', name: 'Bea', roles: ['director'] })
    send.mockClear()

    const again = await add({ email: 'BEA@example.com', name: 'Other Bea', roles: ['admin'] })

    expect(again.status).toBe(409)
    expect(await client.user.count({ where: { email: 'bea@example.com' } })).toBe(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('removes the user, the account, and the reset token when the invite mail fails', async () => {
    const { add, send } = await setup()
    send.mockRejectedValueOnce(new Error('smtp down'))

    const response = await add({ email: 'bea@example.com', name: 'Bea', roles: ['director'] })

    expect(response.status).toBe(502)
    expect(await client.user.count({ where: { email: 'bea@example.com' } })).toBe(0)
    expect(await client.account.count()).toBe(1) // only the admin's
    // The retry works once the mail does.
    send.mockResolvedValue(undefined)
    expect((await add({ email: 'bea@example.com', name: 'Bea', roles: ['director'] })).status).toBe(
      201,
    )
  })

  it('lets the invited user choose a password once, then signs them in', async () => {
    const { add, send, app } = await setup()
    await add({ email: 'bea@example.com', name: 'Bea', roles: ['director'] })
    const token = tokenSentBy(send)
    const newPassword = 'a brand new password 42'

    const first = await request(app).post('/v1/auth/reset-password').send({ token, newPassword })
    const second = await request(app)
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'another password 4242' })

    expect(first.status).toBe(200)
    expect(second.status).toBe(400)
    const signIn = (password: string) =>
      request(app).post('/v1/auth/sign-in/email').send({ email: 'bea@example.com', password })
    expect((await signIn(newPassword)).status).toBe(200)
    expect((await signIn('another password 4242')).status).toBe(401)
  })

  it('keeps an invite link for 72 hours, and a forgot-password or admin reset link for 1 hour', async () => {
    const { auth, add, reset, send, app } = await setup()
    const lifeOfLastLink = async () => {
      const rows = await client.verification.findMany({ orderBy: { createdAt: 'desc' } })
      return (rows[0]?.expiresAt.getTime() ?? 0) - Date.now()
    }
    const near = (left: number, hours: number) => {
      expect(left).toBeGreaterThan((hours * 3600 - 60) * 1000)
      expect(left).toBeLessThanOrEqual(hours * 3600 * 1000)
    }
    await add({ email: 'bea@example.com', name: 'Bea', roles: ['director'] })
    near(await lifeOfLastLink(), 72)
    const dee = await createTestUser(auth, {
      email: 'dee@example.com',
      name: 'Dee',
      role: 'director',
    })

    await reset(dee.id)
    near(await lifeOfLastLink(), 1)

    await request(app).post('/v1/auth/request-password-reset').send({ email: 'dee@example.com' })
    near(await lifeOfLastLink(), 1)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('mails an admin reset to the user and ends the old password only when the link is used', async () => {
    const { auth, reset, send, app } = await setup()
    const bea = await createTestUser(auth, {
      email: 'bea@example.com',
      name: 'Bea',
      role: 'director',
    })

    const response = await reset(bea.id)

    expect(response.status).toBe(204)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.lastCall?.[0].to).toBe('bea@example.com')
    const signIn = (password: string) =>
      request(app).post('/v1/auth/sign-in/email').send({ email: 'bea@example.com', password })
    expect((await signIn(testPassword)).status).toBe(200)
    const newPassword = 'a brand new password 42'
    const used = await request(app)
      .post('/v1/auth/reset-password')
      .send({ token: tokenSentBy(send), newPassword })
    expect(used.status).toBe(200)
    expect((await signIn(testPassword)).status).toBe(401)
    expect((await signIn(newPassword)).status).toBe(200)
  })

  it('answers 404 to a reset for an unknown id and sends no mail', async () => {
    const { reset, send } = await setup()

    expect((await reset('no-such-user')).status).toBe(404)
    expect(send).not.toHaveBeenCalled()
  })

  it('disables a user, ends their session, and enables them again', async () => {
    const { auth, disable, enable, app } = await setup()
    const bea = await createTestUser(auth, {
      email: 'bea@example.com',
      name: 'Bea',
      role: 'director',
    })
    const beaCookie = await signInCookie(auth, bea.email)

    expect((await disable(bea.id)).status).toBe(204)

    expect(await client.user.findUniqueOrThrow({ where: { id: bea.id } })).toMatchObject({
      banned: true,
    })
    expect(await client.session.count({ where: { userId: bea.id } })).toBe(0)
    expect((await request(app).get('/v1/me').set('Cookie', beaCookie)).body.user).toBeNull()

    expect((await enable(bea.id)).status).toBe(204)
    expect(await client.user.findUniqueOrThrow({ where: { id: bea.id } })).toMatchObject({
      banned: false,
    })
  })

  it('refuses an admin who disables themselves', async () => {
    const { admin, disable } = await setup()

    expect((await disable(admin.id)).status).toBe(409)
    expect(await client.user.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({
      banned: false,
    })
  })

  it('changes roles in the database and refuses to take admin from the last admin', async () => {
    const { auth, admin, patch } = await setup()
    const bea = await createTestUser(auth, {
      email: 'bea@example.com',
      name: 'Bea',
      role: 'director',
    })

    const changed = await patch(bea.id, { roles: ['scoreKeeper', 'director'] })
    const refused = await patch(admin.id, { roles: ['director'] })

    expect(changed.status).toBe(200)
    expect(changed.body.roles).toEqual(['scoreKeeper', 'director'])
    expect(await client.user.findUniqueOrThrow({ where: { id: bea.id } })).toMatchObject({
      role: 'scoreKeeper,director',
    })
    expect(refused.status).toBe(409)
    expect(await client.user.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({
      role: 'admin',
    })
  })

  it('lets an admin drop their own admin role when another enabled admin exists', async () => {
    const { auth, admin, patch } = await setup()
    await createTestUser(auth, { email: 'bob@example.com', name: 'Bob', role: 'admin' })

    expect((await patch(admin.id, { roles: ['director'] })).status).toBe(200)
  })

  it('does not count a disabled admin as the other admin', async () => {
    const { auth, admin, patch } = await setup()
    const bob = await createTestUser(auth, { email: 'bob@example.com', name: 'Bob', role: 'admin' })
    await client.user.update({ where: { id: bob.id }, data: { banned: true } })

    expect((await patch(admin.id, { roles: ['director'] })).status).toBe(409)
  })
})
