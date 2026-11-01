import { describe, expect, it } from 'vitest'
import { createCapturedLogger } from '../../test/logger.ts'
import { createTestAuth, createTestUser, signInCookie, testPassword } from '../../test/testAuth.ts'
import { sessionSeconds, withoutToken } from './createAuth.ts'
import { permissionsOf, rolesOf } from './roles.ts'

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

  it('leaves a session used 30 minutes after sign-in as it is, so renewing is hourly and not constant', async () => {
    const { auth, database } = createTestAuth()
    await createTestUser(auth)
    const cookie = await signInCookie(auth)
    const thirtyMinutesOld = new Date(Date.now() + (sessionSeconds - 30 * 60) * 1000)
    const session = database.session[0]
    if (session) session['expiresAt'] = thirtyMinutesOld

    await auth.api.getSession({ headers: new Headers({ cookie }) })

    expect(database.session[0]?.['expiresAt']).toEqual(thirtyMinutesOld)
  })

  it('renews a session that is more than an hour old', async () => {
    const { auth, database } = createTestAuth()
    await createTestUser(auth)
    const cookie = await signInCookie(auth)
    const session = database.session[0]
    if (session) session['expiresAt'] = new Date(Date.now() + (sessionSeconds - 2 * 3600) * 1000)

    await auth.api.getSession({ headers: new Headers({ cookie }) })

    const left = Date.parse(String(database.session[0]?.['expiresAt'])) - Date.now()
    expect(left).toBeGreaterThan((sessionSeconds - 5) * 1000)
  })

  it('turns off Better Auth’s own rate limit and telemetry, which we replace or refuse', () => {
    const { auth } = createTestAuth()

    expect(auth.options.rateLimit?.enabled).toBe(false)
    expect(auth.options.telemetry?.enabled).toBe(false)
  })

  it('keeps its origin and CSRF checks on whatever NODE_ENV says', () => {
    const { auth } = createTestAuth()

    expect(auth.options.advanced?.disableOriginCheck).toBe(false)
    expect(auth.options.advanced?.disableCSRFCheck).toBe(false)
  })

  it('lets only an admin use its admin calls', async () => {
    const { auth } = createTestAuth()
    const target = await createTestUser(auth, { email: 'target@example.com', role: 'scoreKeeper' })
    await createTestUser(auth, { email: 'dee@example.com', role: 'director' })
    await createTestUser(auth, { email: 'ada@example.com', role: 'admin' })
    const directorCookie = await signInCookie(auth, 'dee@example.com')
    const adminCookie = await signInCookie(auth, 'ada@example.com')

    await expect(
      auth.api.banUser({
        body: { userId: target.id },
        headers: new Headers({ cookie: directorCookie }),
      }),
    ).rejects.toThrow()
    await expect(
      auth.api.banUser({
        body: { userId: target.id },
        headers: new Headers({ cookie: adminCookie }),
      }),
    ).resolves.toBeDefined()
  })

  describe('its messages in our log', () => {
    function logging() {
      const captured = createCapturedLogger('debug')
      const { auth } = createTestAuth({ logger: captured.logger })
      const log = (level: 'error' | 'warn' | 'info' | 'debug', ...details: unknown[]) =>
        auth.options.logger?.log?.(level, 'something happened', ...details)
      return { log, records: captured.records }
    }

    it.each([
      ['error', 50],
      ['warn', 40],
      ['info', 20],
      ['debug', 20],
    ] as const)(
      'writes a %s message at our level %i, marked with its source',
      (level, pinoLevel) => {
        const { log, records } = logging()

        log(level)

        expect(records()).toEqual([
          expect.objectContaining({
            level: pinoLevel,
            source: 'better-auth',
            detail: 'something happened',
            msg: 'Auth library message',
          }),
        ])
      },
    )

    it('carries an Error among its details as the error, and ignores the other details', () => {
      const { log, records } = logging()

      log('error', 'extra text', { token: 'secret-token' }, new Error('boom'))

      expect(records()[0]).toMatchObject({ err: { message: 'boom' } })
      expect(JSON.stringify(records())).not.toContain('secret-token')
    })

    it('has no error when none is among the details', () => {
      const { log, records } = logging()

      log('warn', 'extra text')

      expect(records()[0]).not.toHaveProperty('err')
    })
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

describe('withoutToken', () => {
  it('returns a copy of the answer without its token and with everything else', () => {
    const answer = { redirect: false, token: 'abc', user: { id: '1' } }

    expect(withoutToken(answer)).toEqual({ redirect: false, user: { id: '1' } })
    expect(answer.token).toBe('abc')
  })

  it('removes a token that is empty or null', () => {
    expect(withoutToken({ token: '', a: 1 })).toEqual({ a: 1 })
    expect(withoutToken({ token: null, a: 1 })).toEqual({ a: 1 })
  })

  it.each([
    ['an answer without a token', { user: { id: '1' } }],
    ['an error', new Error('nope')],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'token'],
    ['a number', 7],
  ])('has nothing to remove from %s', (_name, answer) => {
    expect(withoutToken(answer)).toBeUndefined()
  })
})
