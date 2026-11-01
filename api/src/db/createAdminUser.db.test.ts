import { prismaAdapter } from 'better-auth/adapters/prisma'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createAuth } from '../shared/auth/createAuth.ts'
import { permissions } from '../shared/auth/permissions.ts'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { createConfig } from '../test/factories.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { resetDatabase } from '../test/resetDatabase.ts'
import { createTestApp } from '../test/testApp.ts'
import { cookieOf, testPassword } from '../test/testAuth.ts'
import { createAdminUser } from './createAdminUser.ts'
import { createScriptAuth } from './scriptAuth.ts'
import type { Prompts } from './terminalPrompts.ts'

const answers = ['ada@example.com', 'Ada Admin']
function prompts(): Prompts {
  const visible = [...answers]
  return {
    ask: () => Promise.resolve(visible.shift() ?? ''),
    askHidden: () => Promise.resolve(testPassword),
    confirm: () => Promise.resolve(false),
    print: () => undefined,
  }
}

describe('createAdminUser on MariaDB', () => {
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

  it('makes an admin who signs in to an API with a different secret, and holds every permission', async () => {
    await createAdminUser({
      auth: createScriptAuth(client),
      countUsers: () => client.user.count(),
      prompts: prompts(),
    })
    const app = createTestApp({
      auth: createAuth({
        config: createConfig().auth,
        database: prismaAdapter(client, { provider: 'mysql' }),
        trustedOrigins: [],
        logger: createCapturedLogger().logger,
      }),
    })

    const signedIn = await request(app)
      .post('/v1/auth/sign-in/email')
      .send({ email: 'ada@example.com', password: testPassword })
    const me = await request(app).get('/v1/me').set('Cookie', cookieOf(signedIn))

    expect(signedIn.status).toBe(200)
    expect(me.body.user).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Admin',
      roles: ['admin'],
      permissions: [...permissions],
    })
  })

  it('stores a hash, not the password', async () => {
    await createAdminUser({
      auth: createScriptAuth(client),
      countUsers: () => client.user.count(),
      prompts: prompts(),
    })

    const account = await client.account.findFirstOrThrow()

    expect(account.password).not.toContain(testPassword)
    expect(account.providerId).toBe('credential')
  })

  it('refuses an email that is taken, and writes nothing more', async () => {
    const run = () =>
      createAdminUser({
        auth: createScriptAuth(client),
        countUsers: () => Promise.resolve(0),
        prompts: prompts(),
      })
    await run()

    await expect(run()).rejects.toThrow('A user with that email already exists')

    expect(await client.user.count()).toBe(1)
  })
})
