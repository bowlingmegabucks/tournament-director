import { prismaAdapter } from 'better-auth/adapters/prisma'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../database.ts'
import { createCapturedLogger } from '../../test/logger.ts'
import { createConfig } from '../../test/factories.ts'
import { resetDatabase } from '../../test/resetDatabase.ts'
import { createTestApp } from '../../test/testApp.ts'
import { cookieOf, setCookies, testPassword } from '../../test/testAuth.ts'
import { callerOf, identifyCaller } from './caller.ts'
import { createAuth, sessionSeconds } from './createAuth.ts'

// The same flow as the memory tests, on the real Prisma adapter and tables (D-100). It proves the
// column names and types in prisma/auth-tables.sql and schema.prisma are the ones Better Auth uses.
describe('sign-in on MariaDB', () => {
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

  function build() {
    const auth = createAuth({
      config: createConfig().auth,
      database: prismaAdapter(client, { provider: 'mysql' }),
      trustedOrigins: [],
      logger: createCapturedLogger().logger,
    })
    return { auth, app: createTestApp({ auth }) }
  }

  it('creates a user, signs in, and keeps the session in the database', async () => {
    const { auth, app } = build()
    await auth.api.createUser({
      body: { email: 'ada@example.com', password: testPassword, name: 'Ada', role: 'admin' },
    })

    const response = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'ada@example.com', password: testPassword })

    expect(response.status).toBe(200)
    const sessions = await client.session.findMany({ include: { user: true } })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.user).toMatchObject({
      email: 'ada@example.com',
      role: 'admin',
      banned: false,
    })
    const left = (sessions[0]?.expiresAt.getTime() ?? 0) - Date.now()
    expect(left).toBeGreaterThan((sessionSeconds - 5) * 1000)
    const account = await client.account.findFirstOrThrow()
    expect(account).toMatchObject({ providerId: 'credential' })
    expect(account.password).not.toContain(testPassword)
  })

  it('finds the user behind the cookie, and sees a role change at once', async () => {
    const { auth, app } = build()
    await auth.api.createUser({
      body: { email: 'dee@example.com', password: testPassword, name: 'Dee', role: 'director' },
    })
    const response = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'dee@example.com', password: testPassword })
    const cookie = cookieOf(response)

    await client.user.update({ where: { email: 'dee@example.com' }, data: { role: 'scoreKeeper' } })

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(session?.user.role).toBe('scoreKeeper')
  })

  it('refuses an expired session', async () => {
    const { auth, app } = build()
    await auth.api.createUser({
      body: { email: 'ada@example.com', password: testPassword, name: 'Ada', role: 'admin' },
    })
    const response = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'ada@example.com', password: testPassword })
    const cookie = cookieOf(response)

    await client.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })

    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it('ends a banned user’s open session and refuses a new sign-in', async () => {
    const { auth, app } = build()
    const admin = await auth.api.createUser({
      body: { email: 'ada@example.com', password: testPassword, name: 'Ada', role: 'admin' },
    })
    const target = await auth.api.createUser({
      body: { email: 'dee@example.com', password: testPassword, name: 'Dee', role: 'director' },
    })
    const signIn = (email: string) =>
      request(app).post('/v1/auth/sign-in/email').send({ email, password: testPassword })
    const adminCookie = cookieOf(await signIn('ada@example.com'))
    const open = cookieOf(await signIn('dee@example.com'))

    await auth.api.banUser({
      body: { userId: target.user.id },
      headers: new Headers({ cookie: adminCookie }),
    })

    expect(admin.user.id).not.toBe(target.user.id)
    expect(await auth.api.getSession({ headers: new Headers({ cookie: open }) })).toBeNull()
    expect((await signIn('dee@example.com')).status).toBe(403)
  })

  it('answers a wrong password with 401 and writes no session', async () => {
    const { auth, app } = build()
    await auth.api.createUser({
      body: { email: 'ada@example.com', password: testPassword, name: 'Ada', role: 'admin' },
    })

    const response = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'ada@example.com', password: 'not the password at all' })

    expect(response.status).toBe(401)
    expect(await client.session.count()).toBe(0)
  })

  it('renews a session used after an hour: the row moves out to 12 hours and a fresh cookie goes back', async () => {
    const { auth, app } = build()
    await auth.api.createUser({
      body: { email: 'ada@example.com', password: testPassword, name: 'Ada', role: 'director' },
    })
    const signedIn = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'ada@example.com', password: testPassword })
    await client.session.updateMany({
      data: { expiresAt: new Date(Date.now() + 10 * 3600 * 1000) },
    })
    const who = express()
    who.use(
      identifyCaller({
        apiKey: createConfig().apiKey,
        auth,
        logger: createCapturedLogger().logger,
      }),
    )
    who.get('/who', (_req, res) => {
      res.json(callerOf(res))
    })

    const response = await request(who).get('/who').set('Cookie', cookieOf(signedIn))

    expect(response.body).toMatchObject({
      type: 'user',
      user: { email: 'ada@example.com', roles: ['director'] },
    })
    const row = await client.session.findFirstOrThrow()
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan((sessionSeconds - 5) * 1000)
    expect(setCookies(response).join(' | ')).toContain(`Max-Age=${sessionSeconds}`)
  })
})
