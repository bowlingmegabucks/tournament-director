import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client.ts'
import { HttpError } from './errors.ts'
import type { Logger } from './logger.ts'

export type { PrismaClient }

// Without these, a database that does not answer holds each request for about 20 seconds.
// The pool tries twice, so a failure takes about twice the value.
const connectionDefaults = { connectTimeout: '2000', acquireTimeout: '2000' }

/** Add short connection timeouts to the URL, unless it sets them. */
export function withConnectionDefaults(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  for (const [name, value] of Object.entries(connectionDefaults)) {
    if (!url.searchParams.has(name)) url.searchParams.set(name, value)
  }
  return url.toString()
}

/**
 * Build the Prisma client for the legacy database (the Node twin of a .NET `DbContext`).
 * Only `server.ts` and the database tests call this; everything else receives the client.
 * The connection opens on the first query, so a down database does not stop startup.
 */
export function createDatabaseClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaMariaDb(withConnectionDefaults(databaseUrl)) })
}

// Prisma error codes for "cannot reach the database": P2039 is the MariaDB adapter's pool failing
// to connect (refused, wrong password, unknown database); the rest are the general codes.
const unavailableCodes = new Set(['P2039', 'P2024', 'P1001', 'P1002', 'P1008', 'P1017'])

export function isDatabaseUnavailable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    unavailableCodes.has(error.code)
  )
}

/**
 * Run a database call. If the database cannot be reached, log the cause and throw a 503 (D-32);
 * any other error passes through and becomes a 500.
 */
export async function withDatabaseErrors<T>(logger: Logger, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!isDatabaseUnavailable(err)) throw err
    logger.error({ err }, 'Database unavailable')
    throw new HttpError(503, 'Database unavailable')
  }
}

/** Ask the database a trivial question. Throws a 503 when it does not answer (D-32). */
export async function pingDatabase(client: PrismaClient, logger: Logger): Promise<void> {
  await withDatabaseErrors(logger, () => client.$queryRaw`SELECT 1`)
}
