import { describe, expect, it } from 'vitest'
import { createTestAuth, createTestUser, testPassword } from '../../test/testAuth.ts'
import { sessionSeconds, type Auth } from './createAuth.ts'
import { permissionsOf, rolesOf } from './roles.ts'

async function signInCookie(auth: Auth, email = 'ada@example.com'): Promise<string> {
  const response = await auth.api.signInEmail({
    body: { email, password: testPassword },
    asResponse: true,
  })
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

describe('createAuth', () => {
  it('stores a user’s password as a salted hash, not as typed', async () => {
    const { auth, database } = createTestAuth()
    await createTestUser(auth)

    const stored = String(database.account[0]?.['password'])

    expect(stored).not.toContain(testPassword)
    expect(stored.length).toBeGreaterThan(60)
  })

  it('has no public sign-up (D-98)', async () => {
    const { auth, database } = createTestAuth()

    await expect(
      auth.api.signUpEmail({ body: { email: 'x@example.com', password: testPassword, name: 'X' } }),
    ).rejects.toThrow()
    expect(database.user).toHaveLength(0)
  })

  // Better Auth checks `minPasswordLength` when a user sets or resets their own password, not in
  // the admin `createUser` call. The first-admin script and the create-user page check it
  // themselves, with `minPasswordLength` from createAuth.ts.

  it.each(['admin', 'director', 'scoreKeeper'] as const)('accepts the role %s', async (role) => {
    const { auth, database } = createTestAuth()

    await createTestUser(auth, { role })

    expect(database.user[0]?.['role']).toBe(role)
  })

  it('refuses a role it does not know, such as a typo', async () => {
    const { auth, database } = createTestAuth()

    await expect(
      auth.api.createUser({
        // @ts-expect-error: the type already rejects it; the check must hold at run time too.
        body: { email: 'x@example.com', password: testPassword, name: 'X', role: 'direcotr' },
      }),
    ).rejects.toThrow()
    expect(database.user).toHaveLength(0)
  })

  it('gives a user made with no role a name that holds no permissions', async () => {
    const { auth, database } = createTestAuth()

    await auth.api.createUser({
      body: { email: 'x@example.com', password: testPassword, name: 'X' },
    })

    expect(database.user[0]?.['role']).toBe('none')
    expect(permissionsOf(String(database.user[0]?.['role']))).toEqual([])
  })

  it('keeps several roles on one user as a comma list', async () => {
    const { auth, database } = createTestAuth()

    await auth.api.createUser({
      body: {
        email: 'x@example.com',
        password: testPassword,
        name: 'X',
        role: ['director', 'scoreKeeper'],
      },
    })

    expect(database.user[0]?.['role']).toBe('director,scoreKeeper')
    expect(rolesOf(String(database.user[0]?.['role']))).toEqual(['director', 'scoreKeeper'])
  })

  it('finds the user behind a session cookie, with their role', async () => {
    const { auth } = createTestAuth()
    await createTestUser(auth, { role: 'director' })
    const cookie = await signInCookie(auth)

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })

    expect(session?.user).toMatchObject({ email: 'ada@example.com', role: 'director' })
  })

  it('refuses a session that has expired', async () => {
    const { auth, database } = createTestAuth()
    await createTestUser(auth)
    const cookie = await signInCookie(auth)
    const session = database.session[0]
    if (session) session['expiresAt'] = new Date(Date.now() - 1000)

    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it('renews the 12 hours when a session is used after an hour (D-99)', async () => {
    const { auth, database } = createTestAuth()
    await createTestUser(auth)
    const cookie = await signInCookie(auth)
    const session = database.session[0]
    if (session) session['expiresAt'] = new Date(Date.now() + 10 * 3600 * 1000)

    await auth.api.getSession({ headers: new Headers({ cookie }) })

    const left = Date.parse(String(database.session[0]?.['expiresAt'])) - Date.now()
    expect(left).toBeGreaterThan((sessionSeconds - 5) * 1000)
  })

  it('leaves a session that was used within the hour as it is', async () => {
    const { auth, database } = createTestAuth()
    await createTestUser(auth)
    const cookie = await signInCookie(auth)
    const before = String(database.session[0]?.['expiresAt'])

    await auth.api.getSession({ headers: new Headers({ cookie }) })

    expect(String(database.session[0]?.['expiresAt'])).toBe(before)
  })

  it('sees a role change on the next request, so a demotion applies at once (D-96)', async () => {
    const { auth, database } = createTestAuth()
    await createTestUser(auth, { role: 'director' })
    const cookie = await signInCookie(auth)
    const user = database.user[0]
    if (user) user['role'] = 'scoreKeeper'

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })

    expect(session?.user.role).toBe('scoreKeeper')
  })
})
