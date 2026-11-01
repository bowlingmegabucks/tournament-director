import { memoryAdapter } from 'better-auth/adapters/memory'
import { createAuth, type Auth } from '../shared/auth/createAuth.ts'
import type { RoleName } from '../shared/auth/roles.ts'
import { createConfig } from './factories.ts'
import type { Logger } from '../shared/logger.ts'
import { createCapturedLogger } from './logger.ts'

/** A password that passes the length rule. Tests sign in with it. */
export const testPassword = 'correct horse battery staple'

type Table = Record<string, unknown>[]

/** Make every database call fail, to see how the API behaves when the database is down. */
export interface Outage {
  /** Fail every call with this error (default: the Prisma "cannot connect" error, `P2039`). */
  start: (error?: Error) => void
  end: () => void
  wrap: <T extends (options: never) => object>(adapter: T) => T
}

/** The error Prisma raises when the pool cannot connect (`isDatabaseUnavailable` knows it). */
export const databaseUnavailableError = (): Error =>
  Object.assign(new Error('pool failed to retrieve a connection from pool'), { code: 'P2039' })

function createOutage(): Outage {
  let failure: Error | undefined
  return {
    start: (error = databaseUnavailableError()) => {
      failure = error
    },
    end: () => {
      failure = undefined
    },
    wrap: (adapter) =>
      ((options: never) => {
        const real = adapter(options)
        return new Proxy(real, {
          get(target, key, receiver) {
            const value: unknown = Reflect.get(target, key, receiver)
            if (typeof value !== 'function' || failure === undefined) return value
            const error = failure
            return () => Promise.reject(error)
          },
        })
      }) as typeof adapter,
  }
}
// A Record, not an interface: Better Auth's memory adapter wants an index signature.
export type TestAuthDatabase = Record<'user' | 'session' | 'account' | 'verification', Table>

export interface TestAuthOptions {
  /** Pages allowed to call sign-in from a browser. Empty by default, like CORS. */
  trustedOrigins?: string[]
  /** The API's own address. A `https` one marks the cookie `Secure`. */
  baseUrl?: string
  /** Where Better Auth's own messages go. A test passes a captured logger to read them. */
  logger?: Logger
}

/**
 * Better Auth on a memory database, so tests need no Docker. `database` is the tables themselves:
 * a test may change a row (say, an old `expiresAt`) to see how the API reacts.
 */
export function createTestAuth(options: TestAuthOptions = {}): {
  auth: Auth
  database: TestAuthDatabase
  outage: Outage
} {
  const database: TestAuthDatabase = { user: [], session: [], account: [], verification: [] }
  const config = createConfig().auth
  const outage = createOutage()
  const auth = createAuth({
    config: { ...config, baseUrl: options.baseUrl ?? config.baseUrl },
    database: outage.wrap(memoryAdapter(database)),
    trustedOrigins: options.trustedOrigins ?? [],
    logger: options.logger ?? createCapturedLogger().logger,
  })
  return { auth, database, outage }
}

/** Add a user who can sign in, the way the first-admin script does (no session needed). */
export async function createTestUser(
  auth: Auth,
  {
    email = 'ada@example.com',
    role = 'admin',
    name = 'Ada Admin',
    password = testPassword,
  }: { email?: string; role?: RoleName; name?: string; password?: string } = {},
): Promise<{ id: string; email: string; role: string }> {
  const { user } = await auth.api.createUser({ body: { email, password, name, role } })
  return { id: user.id, email: user.email, role }
}

/** The `Set-Cookie` lines of a response. supertest types the header as one string; it is a list. */
export function setCookies(response: { headers: Record<string, unknown> }): string[] {
  const value = response.headers['set-cookie']
  return Array.isArray(value)
    ? value.filter((line): line is string => typeof line === 'string')
    : []
}

/** The `Cookie` header a browser would send back after this response. */
export function cookieOf(response: { headers: Record<string, unknown> }): string {
  return setCookies(response)
    .map((line) => line.split(';')[0])
    .join('; ')
}

/** Sign a test user in and return the `Cookie` header a browser would send next. */
export async function signInCookie(
  auth: Auth,
  email = 'ada@example.com',
  password = testPassword,
): Promise<string> {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
  return response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ')
}
