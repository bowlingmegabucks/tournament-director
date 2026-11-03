import { APIError } from 'better-auth/api'
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
import { createInviteExtender } from '../../shared/auth/createAuth.ts'
import { createInviteMailer } from './inviteMail.ts'

const webBaseUrl = 'https://example.com/tournament-director'
const newUser = { email: 'Bea@Example.com', name: 'Bea Bowler', roles: ['scoreKeeper'] }

async function setup({
  role = 'admin',
  mail = true,
  send = vi.fn<Mailer['send']>().mockResolvedValue(undefined),
}: { role?: RoleName; mail?: boolean; send?: Mock<Mailer['send']> } = {}) {
  const captured = createCapturedLogger()
  const invites = createInviteMailer({ send }, webBaseUrl, captured.logger, (token) =>
    createInviteExtender(() => auth)(token),
  )
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
  const list = () => request(app).get('/v1/users').set('Cookie', cookie)
  const reset = (id: string) =>
    request(app).post(`/v1/users/${id}/password-reset`).set('Cookie', cookie)
  const patch = (id: string, body: unknown) =>
    request(app)
      .patch(`/v1/users/${id}`)
      .set('Cookie', cookie)
      .send(body as object)
  const disable = (id: string) => request(app).post(`/v1/users/${id}/disable`).set('Cookie', cookie)
  const enable = (id: string) => request(app).post(`/v1/users/${id}/enable`).set('Cookie', cookie)
  return {
    app,
    auth,
    database,
    outage,
    send,
    cookie,
    caller,
    add,
    list,
    reset,
    patch,
    disable,
    enable,
    records: captured.records,
  }
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

  it('answers 401 to a signed-out caller on the list and the reset', async () => {
    const { app } = await setup()

    expect((await request(app).get('/v1/users')).status).toBe(401)
    expect((await request(app).post('/v1/users/abc/password-reset')).status).toBe(401)
  })

  it('answers 401 to a signed-out caller on disable, enable, and edit', async () => {
    const { app } = await setup()

    expect((await request(app).post('/v1/users/abc/disable')).status).toBe(401)
    expect((await request(app).post('/v1/users/abc/enable')).status).toBe(401)
    expect(
      (
        await request(app)
          .patch('/v1/users/abc')
          .send({ roles: ['admin'] })
      ).status,
    ).toBe(401)
  })

  it.each<RoleName>(['director', 'scoreKeeper'])(
    'answers 403 to a %s on the list, the reset, and the edits',
    async (role) => {
      const { list, reset, disable, enable, patch, send } = await setup({ role })

      expect((await list()).status).toBe(403)
      expect((await reset('abc')).status).toBe(403)
      expect((await disable('abc')).status).toBe(403)
      expect((await enable('abc')).status).toBe(403)
      expect((await patch('abc', { roles: ['admin'] })).status).toBe(403)
      expect(send).not.toHaveBeenCalled()
    },
  )

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

  it('trims the email before it is stored', async () => {
    const { add } = await setup()

    const response = await add({ ...newUser, email: '  Bea@Example.com  ' })

    expect(response.status).toBe(201)
    expect(response.body.email).toBe('bea@example.com')
  })

  it('says which rule an empty role list breaks', async () => {
    const { add } = await setup()

    const response = await add({ ...newUser, roles: [] })

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('pick at least one role')
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

  it('refuses a body over 10 KB as too large', async () => {
    const { app, cookie } = await setup()

    const response = await request(app)
      .post('/v1/users')
      .set('Cookie', cookie)
      .send({ ...newUser, name: 'x'.repeat(11_000) })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is too large.' })
  })

  it('answers 409 only for the duplicate-email error, not another refusal', async () => {
    const { add, auth } = await setup()
    vi.spyOn(auth.api, 'createUser').mockRejectedValueOnce(
      new APIError('BAD_REQUEST', { message: 'Other', code: 'SOMETHING_ELSE' }),
    )

    const response = await add()

    expect(response.status).not.toBe(409)
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

describe('GET /v1/users', () => {
  it('lists every user by name with roles and status, and nothing else', async () => {
    const { add, list, auth, database, cookie } = await setup()
    await add({
      ...newUser,
      name: 'Zed Last',
      email: 'zed@example.com',
      roles: ['director', 'scoreKeeper'],
    })
    await add({ ...newUser, name: 'Bea Bowler' })
    const zed = database.user.find((user) => user['email'] === 'zed@example.com')
    await auth.api.banUser({
      body: { userId: String(zed?.['id']) },
      headers: new Headers({ cookie }),
    })

    const response = await list()

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.users.map((user: { name: string }) => user.name)).toEqual([
      'Ada Admin',
      'Bea Bowler',
      'Zed Last',
    ])
    expect(response.body.users[2]).toEqual({
      id: expect.any(String) as string,
      email: 'zed@example.com',
      name: 'Zed Last',
      roles: ['director', 'scoreKeeper'],
      disabled: true,
    })
    expect(response.body.users[0]).toMatchObject({ roles: ['admin'], disabled: false })
    expect(JSON.stringify(response.body)).not.toMatch(/password|token|session|account/i)
  })

  it('answers 503 when the database is down', async () => {
    const { list, outage } = await setup()
    outage.start(databaseUnavailableError())

    expect((await list()).status).toBe(503)
  })
})

describe('POST /v1/users/:id/password-reset', () => {
  async function withUser() {
    const context = await setup()
    const created = await context.add()
    context.send.mockClear()
    return { ...context, id: created.body.id as string }
  }

  it('emails the user a link to choose a new password, in the admin wording', async () => {
    const { reset, send, id } = await withUser()

    const response = await reset(id)

    expect(response.status).toBe(204)
    expect(send).toHaveBeenCalledTimes(1)
    const message = send.mock.calls[0]?.[0]
    expect(message?.to).toBe('bea@example.com')
    expect(message?.text).toContain('An admin started a password reset')
    expect(message?.text).toContain(`${webBaseUrl}/set-password?token=`)
  })

  it('lets the link set a password, without the admin ever seeing one', async () => {
    const { app, reset, send, id } = await withUser()
    await reset(id)
    const token = /token=([\w-]+)/.exec(send.mock.calls[0]?.[0].text ?? '')?.[1]

    const set = await request(app)
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'a brand new password 42' })
    const signIn = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'bea@example.com', password: 'a brand new password 42' })

    expect(set.status).toBe(200)
    expect(signIn.status).toBe(200)
  })

  it('answers 404 for an unknown user, and sends nothing', async () => {
    const { reset, send } = await setup()

    const response = await reset('no-such-user')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'User not found.' })
    expect(send).not.toHaveBeenCalled()
  })

  it('answers 502 when the mail fails, and says so', async () => {
    const { reset, send, id } = await withUser()
    send.mockRejectedValueOnce(new Error('535 bad login'))

    const response = await reset(id)

    expect(response.status).toBe(502)
    expect(response.body).toEqual({
      message: 'The reset email could not be sent. Check the mail settings and try again.',
    })
  })

  it('answers 503 when the API has no mail settings', async () => {
    const { id } = await withUser()
    const none = await setup({ mail: false })

    const response = await none.reset(id)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      message: 'Email is not set up on the server, so no link can be sent.',
    })
  })

  it('answers 404 only when the user is not found, not for another failure', async () => {
    const { reset, auth, send } = await setup()
    vi.spyOn(auth.api, 'getUser').mockRejectedValueOnce(
      new APIError('FORBIDDEN', { message: 'No' }),
    )

    const response = await reset('some-id')

    expect(response.status).not.toBe(404)
    expect(send).not.toHaveBeenCalled()
  })

  it('logs the user id, never the email or the link', async () => {
    const { reset, id, records } = await withUser()

    await reset(id)

    const line = records().find((record) => record.msg === 'Password reset sent')
    expect(line).toMatchObject({ userId: id })
    expect(JSON.stringify(records())).not.toContain('set-password')
  })
})

describe('disable and enable', () => {
  async function withUser() {
    const context = await setup()
    const created = await context.add()
    return { ...context, id: created.body.id as string }
  }

  it('disables a user: the list says so', async () => {
    const { disable, list, id } = await withUser()

    const response = await disable(id)

    expect(response.status).toBe(204)
    const users = (await list()).body.users as { id: string; disabled: boolean }[]
    expect(users.find((user) => user.id === id)?.disabled).toBe(true)
  })

  it('ends a signed-in user’s access at once, and blocks sign-in', async () => {
    const { app, auth, disable, enable, id } = await setup().then(async (context) => {
      const created = await context.add()
      return { ...context, id: created.body.id as string }
    })
    // Give Bea a known password through the credential account the admin made.
    const ctx = await auth.$context
    const hashed = await ctx.password.hash('bea password long enough')
    await ctx.internalAdapter.updatePassword(id, hashed)
    const beaCookie = await signInCookie(auth, 'bea@example.com', 'bea password long enough')
    expect((await request(app).get('/v1/me').set('Cookie', beaCookie)).body.user).not.toBeNull()

    await disable(id)

    const me = await request(app).get('/v1/me').set('Cookie', beaCookie)
    expect(me.body.user ?? null).toBeNull()
    const signIn = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'bea@example.com', password: 'bea password long enough' })
    expect(signIn.status).toBe(403)

    expect((await enable(id)).status).toBe(204)
    const again = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'bea@example.com', password: 'bea password long enough' })
    expect(again.status).toBe(200)
  })

  it('enables a user again', async () => {
    const { disable, enable, list, id } = await withUser()
    await disable(id)

    const response = await enable(id)

    expect(response.status).toBe(204)
    const users = (await list()).body.users as { id: string; disabled: boolean }[]
    expect(users.find((user) => user.id === id)?.disabled).toBe(false)
  })

  it('answers 404 for an unknown user', async () => {
    const { disable, enable } = await setup()

    expect((await disable('nope')).status).toBe(404)
    expect((await enable('nope')).status).toBe(404)
  })

  it('refuses to let an admin disable their own account', async () => {
    const { disable, caller } = await setup()

    const response = await disable(caller.id)

    expect(response.status).toBe(409)
    expect(response.body.message).toBe('You cannot disable your own account.')
  })

  it('logs who did it and whom, never an email', async () => {
    const { disable, enable, id, caller, records } = await withUser()

    await disable(id)
    await enable(id)

    expect(records()).toContainEqual(
      expect.objectContaining({ msg: 'User disabled', actorId: caller.id, userId: id }),
    )
    expect(records()).toContainEqual(
      expect.objectContaining({ msg: 'User enabled', actorId: caller.id, userId: id }),
    )
    expect(JSON.stringify(records())).not.toContain('bea@example.com')
  })
})

describe('PATCH /v1/users/:id', () => {
  async function withUser() {
    const context = await setup()
    const created = await context.add()
    return { ...context, id: created.body.id as string }
  }

  it('replaces the roles and answers with the user', async () => {
    const { patch, list, database, id } = await withUser()

    const response = await patch(id, { roles: ['director', 'director', 'scoreKeeper'] })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id,
      email: 'bea@example.com',
      name: 'Bea Bowler',
      roles: ['director', 'scoreKeeper'],
      disabled: false,
    })
    expect(database.user.find((user) => user['id'] === id)?.['role']).toBe('director,scoreKeeper')
    const listed = (await list()).body.users as { id: string; roles: string[] }[]
    expect(listed.find((user) => user.id === id)?.roles).toEqual(['director', 'scoreKeeper'])
  })

  it('reaches the user’s next request', async () => {
    const { app, auth, patch, id } = await withUser()
    const ctx = await auth.$context
    await ctx.internalAdapter.updatePassword(
      id,
      await ctx.password.hash('bea password long enough'),
    )
    const beaCookie = await signInCookie(auth, 'bea@example.com', 'bea password long enough')
    const before = await request(app).get('/v1/me').set('Cookie', beaCookie)
    expect(before.body.user.roles).toEqual(['scoreKeeper'])

    await patch(id, { roles: ['director'] })

    const after = await request(app).get('/v1/me').set('Cookie', beaCookie)
    expect(after.body.user.roles).toEqual(['director'])
  })

  it.each([
    ['no roles', { roles: [] }],
    ['an unknown role', { roles: ['owner'] }],
    ['no roles field', {}],
  ])('answers 400 for %s', async (_label, body) => {
    const { patch, id } = await withUser()

    expect((await patch(id, body)).status).toBe(400)
  })

  it('answers 404 for an unknown user', async () => {
    const { patch } = await setup()

    expect((await patch('nope', { roles: ['admin'] })).status).toBe(404)
  })

  it('refuses to remove admin from the last enabled admin', async () => {
    const { patch, caller } = await setup()

    const response = await patch(caller.id, { roles: ['director'] })

    expect(response.status).toBe(409)
    expect(response.body.message).toContain('no enabled admin')
  })

  it('lets the only admin add roles while keeping admin', async () => {
    const { patch, caller } = await setup()

    const response = await patch(caller.id, { roles: ['admin', 'director'] })

    expect(response.status).toBe(200)
  })

  it('lets an admin drop their own admin role when another enabled admin exists', async () => {
    const { add, patch, caller } = await setup()
    await add({ ...newUser, email: 'sam@example.com', roles: ['admin'] })

    const response = await patch(caller.id, { roles: ['director'] })

    expect(response.status).toBe(200)
  })

  it('does not count a disabled admin as one that remains', async () => {
    const { add, patch, disable, caller } = await setup()
    const sam = await add({ ...newUser, email: 'sam@example.com', roles: ['admin'] })
    await disable(sam.body.id as string)

    expect((await patch(caller.id, { roles: ['director'] })).status).toBe(409)
  })

  it('lets an admin take any role from another user, even the admin role from a disabled admin', async () => {
    const { add, patch, disable } = await setup()
    const sam = await add({ ...newUser, email: 'sam@example.com', roles: ['admin'] })
    await disable(sam.body.id as string)

    const response = await patch(sam.body.id as string, { roles: ['scoreKeeper'] })

    expect(response.status).toBe(200)
  })

  it('asks only for admins, up to 200, when it looks for another admin', async () => {
    const { add, patch, auth, caller } = await setup()
    await add({ ...newUser, email: 'sam@example.com', roles: ['admin'] })
    const listUsers = vi.spyOn(auth.api, 'listUsers')

    await patch(caller.id, { roles: ['director'] })

    expect(listUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          limit: 200,
          filterField: 'role',
          filterValue: 'admin',
        }) as object,
      }),
    )
  })

  it('logs who did it and the new roles, never an email', async () => {
    const { patch, id, caller, records } = await withUser()

    await patch(id, { roles: ['director'] })

    expect(records()).toContainEqual(
      expect.objectContaining({
        msg: 'User roles changed',
        actorId: caller.id,
        userId: id,
        roles: ['director'],
      }),
    )
    expect(JSON.stringify(records())).not.toContain('bea@example.com')
  })

  it('answers 400 for a body that is not JSON', async () => {
    const { app, cookie, id } = await withUser()

    const response = await request(app)
      .patch(`/v1/users/${id}`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{nope')

    expect(response.status).toBe(400)
  })
})
