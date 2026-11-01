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
import { seedTournaments } from './seedTournaments.ts'

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
    await expect(seedUsers(client, createScriptAuth(client))).resolves.toEqual({ added: 3 })

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

    await expect(seedUsers(client, auth)).resolves.toEqual({ added: 0 })

    expect(await client.user.count()).toBe(3)
    expect(
      (await client.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } })).name,
    ).toBe('Renamed')
  })

  it('adds only the user that is missing', async () => {
    const auth = createScriptAuth(client)
    await seedUsers(client, auth)
    await client.user.delete({ where: { email: 'director@example.com' } })

    await expect(seedUsers(client, auth)).resolves.toEqual({ added: 1 })

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

  describe('on a database that may be a real one', () => {
    async function withRealAdmin() {
      const auth = createScriptAuth(client)
      await auth.api.createUser({
        body: {
          email: 'owner@bowlingmegabucks.com',
          name: 'Owner',
          password: 'a real password 123',
          role: 'admin',
        },
      })
      return auth
    }

    it('refuses to add the known-password users when someone else is already there', async () => {
      const auth = await withRealAdmin()

      const result = await seedUsers(client, auth)

      expect(result.added).toBe(0)
      expect(result.skippedReason).toContain('--force-users')
      expect(await client.user.count()).toBe(1)
    })

    it('refuses even when some of the sample users are there too', async () => {
      const auth = createScriptAuth(client)
      await seedUsers(client, auth)
      await client.user.delete({ where: { email: 'director@example.com' } })
      await withRealAdmin()

      const result = await seedUsers(client, auth)

      expect(result.added).toBe(0)
      expect(await client.user.count({ where: { email: 'director@example.com' } })).toBe(0)
    })

    it('refuses on an empty user table when the database holds a real tournament', async () => {
      await seedTournaments(client)
      await client.$executeRaw`
        INSERT INTO Tournaments
          (Id, Name, Start, End, EntryFee, Games, FinalsRatio, CashRatio, SuperSweperCashRatio,
           BowlingCenter, Completed)
        VALUES ('11111111-2222-4333-8444-555555555555', 'Real', NOW(), NOW(), 50, 6, 7.0, 5.0, 5.0,
                'Real Lanes', 0)`

      const result = await seedUsers(client, createScriptAuth(client))

      expect(result.added).toBe(0)
      expect(result.skippedReason).toContain('--force-users')
      expect(await client.user.count()).toBe(0)
    })

    it('adds them when told to force it', async () => {
      const auth = await withRealAdmin()

      const result = await seedUsers(client, auth, { force: true })

      expect(result).toEqual({ added: 3 })
      expect(await client.user.count()).toBe(4)
    })

    it('does not refuse on a database that holds only the sample users', async () => {
      const auth = createScriptAuth(client)
      await seedUsers(client, auth)

      const result = await seedUsers(client, auth)

      expect(result.skippedReason).toBeUndefined()
    })
  })

  it('lists passwords that meet the minimum length', () => {
    for (const { password } of localUsers) {
      expect(password.length).toBeGreaterThanOrEqual(12)
    }
  })
})
