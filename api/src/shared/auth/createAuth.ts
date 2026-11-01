import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access'
import type { AuthConfig } from '../../config.ts'
import type { Logger } from '../logger.ts'
import type { RoleName } from './roles.ts'

/** A session lasts 12 hours from the last request (D-99). */
export const sessionSeconds = 12 * 60 * 60
/** Use inside the window renews it, at most once an hour, so a busy day never signs anyone out. */
const sessionRenewSeconds = 60 * 60

export const minPasswordLength = 12
/** Better Auth's own ceiling. A longer one is refused at sign-in, so we refuse it up front. */
export const maxPasswordLength = 128

// Better Auth's own rules for who may call its admin paths (create user, ban, set role). Only the
// admin role may. Director and score keeper get none; their permissions are ours (D-96). Declaring
// all three names also makes Better Auth refuse a role it does not know, such as a typo. A user may
// hold several roles; Better Auth stores them as `director,scoreKeeper`.
const accessControl = createAccessControl(defaultStatements)
const roles = {
  admin: accessControl.newRole(adminAc.statements),
  director: accessControl.newRole({}),
  scoreKeeper: accessControl.newRole({}),
} satisfies Record<RoleName, unknown>

export interface AuthDependencies {
  config: AuthConfig
  /** Where users and sessions live: the Prisma adapter in `server.ts`, memory in tests. */
  database: BetterAuthOptions['database']
  /** Pages allowed to call sign-in from a browser. Better Auth refuses a POST from any other. */
  trustedOrigins: string[]
  logger: Logger
}

/**
 * Build Better Auth, the Node twin of ASP.NET Core Identity: it keeps users and sessions in our
 * database, hashes passwords, and issues the session cookie (D-98, D-99). Only `server.ts` and the
 * tests build it; everything else receives it.
 *
 * Choices:
 * - Email and password only, and no public sign-up: new users come from an admin (D-98, D-101).
 * - Its own rate limit and telemetry are off. Sign-in throttling sits in `features/auth/routes.ts`
 *   where it knows the real client address (`TRUST_PROXY`), and nothing may leave the server.
 * - It reaches the world only through `features/auth/routes.ts`, which allows two paths.
 * - The `admin` plugin adds the `role` and ban columns. It stores a role name from `roles.ts`; the
 *   permissions that go with it live in our own table (D-96).
 */
export function createAuth({ config, database, trustedOrigins, logger }: AuthDependencies) {
  return betterAuth({
    database,
    secret: config.secret,
    baseURL: config.baseUrl,
    basePath: '/v1/auth',
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength,
      maxPasswordLength,
    },
    session: { expiresIn: sessionSeconds, updateAge: sessionRenewSeconds },
    // Every way we make users names a role. A user made with none gets `none`, which is not a role,
    // so they hold no permissions (roles.ts drops names it does not know).
    plugins: [admin({ ac: accessControl, roles, defaultRole: 'none' })],
    hooks: {
      // An answer that carries `token` (the sign-in answer does) is sent without it. The token is
      // the session token without its signature. The cookie is what signs a user in, and the web
      // app never reads the body.
      after: createAuthMiddleware(async (ctx) => {
        const answer = withoutToken(ctx.context.returned)
        if (answer) return ctx.json(answer)
      }),
    },
    // Better Auth skips its origin and CSRF checks when NODE_ENV is `test`. Say "on" in every
    // environment, so a stray variable cannot switch them off.
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    // Rethrow what Better Auth does not expect (a database failure), so it reaches our error
    // handler and our logger. Without this it prints its own stack dump to the console and answers
    // an empty 500. Errors it expects (a wrong password, a bad origin) are unchanged.
    onAPIError: { throw: true },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    logger: {
      // Our logger decides what shows.
      level: 'debug',
      log: (level, message, ...details) => {
        const error = details.find((detail): detail is Error => detail instanceof Error)
        const logLevel: 'error' | 'warn' | 'debug' =
          level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug'
        logger[logLevel](
          { source: 'better-auth', detail: message, err: error },
          'Auth library message',
        )
      },
    },
  })
}

/**
 * A copy of an endpoint's answer without its `token`, or `undefined` when there is nothing to
 * remove (not an object, an error, or no `token`). Exported for its test.
 */
export function withoutToken(answer: unknown): Record<string, unknown> | undefined {
  if (typeof answer !== 'object' || answer === null || !('token' in answer)) return undefined
  return Object.fromEntries(Object.entries(answer).filter(([key]) => key !== 'token'))
}

export type Auth = ReturnType<typeof createAuth>
