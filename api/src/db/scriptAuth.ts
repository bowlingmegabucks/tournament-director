import { randomBytes } from 'node:crypto'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { createAuth, type Auth } from '../shared/auth/createAuth.ts'
import { createLogger } from '../shared/logger.ts'
import type { PrismaClient } from '../shared/database.ts'

/**
 * Better Auth for the scripts in `src/db/`, which write users but never sign anyone in. The secret
 * signs cookies and the address builds links; a script needs neither, and the password hash does
 * not use the secret. So the script needs only `DATABASE_URL`, and a user it makes signs in to the
 * real API as usual.
 */
export function createScriptAuth(client: PrismaClient): Auth {
  return createAuth({
    config: { secret: randomBytes(32).toString('hex'), baseUrl: 'http://localhost' },
    database: prismaAdapter(client, { provider: 'mysql' }),
    trustedOrigins: [],
    logger: createLogger({ logLevel: 'error', telemetry: { serviceName: 'db-script' } }),
  })
}
