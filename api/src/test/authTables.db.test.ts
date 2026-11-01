import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { authSchemaSql } from './authSchema.ts'
import { resetDatabase } from './resetDatabase.ts'

describe('auth tables (D-100)', () => {
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

  const newUser = (email = 'ada@example.com') => ({
    id: crypto.randomUUID(),
    name: 'Ada',
    email,
    role: 'admin',
  })

  it('can run the script again without an error or data loss', async () => {
    const user = await client.user.create({ data: newUser() })

    for (const statement of authSchemaSql()) {
      await client.$executeRawUnsafe(statement) // NOSONAR: order matters
    }

    expect(await client.user.findUnique({ where: { id: user.id } })).not.toBeNull()
  })

  it('stores a user with a session and a hashed password and reads them back', async () => {
    const user = await client.user.create({
      data: {
        ...newUser(),
        sessions: {
          create: {
            id: crypto.randomUUID(),
            token: 't-1',
            expiresAt: new Date(Date.now() + 1000),
            updatedAt: new Date(),
          },
        },
        accounts: {
          create: {
            id: crypto.randomUUID(),
            accountId: 'a-1',
            providerId: 'credential',
            password: 'salt:hash',
            updatedAt: new Date(),
          },
        },
      },
      include: { sessions: true, accounts: true },
    })

    expect(user).toMatchObject({ emailVerified: false, banned: false, role: 'admin' })
    expect(user.sessions).toHaveLength(1)
    expect(user.accounts[0]).toMatchObject({ providerId: 'credential', password: 'salt:hash' })
  })

  it('refuses a second user with the same email', async () => {
    await client.user.create({ data: newUser('same@example.com') })

    await expect(client.user.create({ data: newUser('same@example.com') })).rejects.toThrow()
  })

  it('removes a user’s sessions and accounts with the user', async () => {
    const user = await client.user.create({
      data: {
        ...newUser(),
        sessions: {
          create: {
            id: crypto.randomUUID(),
            token: 't-2',
            expiresAt: new Date(Date.now() + 1000),
            updatedAt: new Date(),
          },
        },
        accounts: {
          create: {
            id: crypto.randomUUID(),
            accountId: 'a-2',
            providerId: 'credential',
            updatedAt: new Date(),
          },
        },
      },
    })

    await client.user.delete({ where: { id: user.id } })

    expect(await client.session.count()).toBe(0)
    expect(await client.account.count()).toBe(0)
  })

  it('is emptied by resetDatabase', async () => {
    await client.user.create({
      data: {
        ...newUser(),
        sessions: {
          create: {
            id: crypto.randomUUID(),
            token: 't-3',
            expiresAt: new Date(Date.now() + 1000),
            updatedAt: new Date(),
          },
        },
      },
    })
    await client.verification.create({
      data: {
        id: crypto.randomUUID(),
        identifier: 'x',
        value: 'y',
        expiresAt: new Date(Date.now() + 1000),
      },
    })

    await resetDatabase(client)

    expect(await client.user.count()).toBe(0)
    expect(await client.session.count()).toBe(0)
    expect(await client.verification.count()).toBe(0)
  })
})
