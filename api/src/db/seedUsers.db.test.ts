import { prismaAdapter } from 'better-auth/adapters/prisma'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createAuth } from '../shared/auth/createAuth.ts'
import { permissionsOf } from '../shared/auth/roles.ts'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { createConfig } from '../test/factories.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'
import { createTestApp } from '../test/testApp.ts'
import { cookieOf } from '../test/testAuth.ts'
import { createScriptAuth } from './scriptAuth.ts'
import { localUsers, seedUsers } from './seedUsers.ts'

describe('seedUsers', () => {
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

  it('adds one user per role', async () => {
    await expect(seedUsers(client, createScriptAuth(client))).resolves.toBe(3)

    const users = await client.user.findMany({ orderBy: { email: 'asc' } })
    expect(users.map((user) => [user.email, user.role])).toEqual([
      ['admin@example.com', 'admin'],
      ['director@example.com', 'director'],
      ['scorekeeper@example.com', 'scoreKeeper'],
    ])
  })

  it('is safe to run again, and leaves a user it finds alone', async () => {
    const auth = createScriptAuth(client)
    await seedUsers(client, auth)
    await client.user.update({ where: { email: 'admin@example.com' }, data: { name: 'Renamed' } })

    await expect(seedUsers(client, auth)).resolves.toBe(0)

    expect(await client.user.count()).toBe(3)
    expect(
      (await client.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } })).name,
    ).toBe('Renamed')
  })

  it('adds only the user that is missing', async () => {
    const auth = createScriptAuth(client)
    await seedUsers(client, auth)
    await client.user.delete({ where: { email: 'director@example.com' } })

    await expect(seedUsers(client, auth)).resolves.toBe(1)

    expect(await client.user.count()).toBe(3)
  })

  it('makes users who sign in to the API with the listed passwords, each with their role', async () => {
    await seedUsers(client, createScriptAuth(client))
    // An API with its own secret, unlike the script's: the users must still sign in.
    const app = createTestApp({
      auth: createAuth({
        config: createConfig().auth,
        database: prismaAdapter(client, { provider: 'mysql' }),
        trustedOrigins: [],
        logger: createCapturedLogger().logger,
      }),
    })

    for (const { email, password, role } of localUsers) {
      const signedIn = await request(app).post('/v1/auth/sign-in/email').send({ email, password })
      expect(signedIn.status).toBe(200)
      const me = await request(app).get('/v1/me').set('Cookie', cookieOf(signedIn))
      expect(me.body.user).toMatchObject({ email, roles: [role] })
      expect(me.body.user.permissions).toEqual(permissionsOf(role))
    }
  })

  it('lists passwords that meet the minimum length', () => {
    for (const { password } of localUsers) {
      expect(password.length).toBeGreaterThanOrEqual(12)
    }
  })
})
