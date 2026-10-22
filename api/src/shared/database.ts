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

// Stryker disable all: these two need a real database; src/shared/database.db.test.ts covers them.
/**
 * Build the Prisma client for the legacy database (the Node twin of a .NET `DbContext`).
 * Only `server.ts` and the database tests call this; everything else receives the client.
 * The connection opens on the first query, so a down database does not stop startup.
 */
export function createDatabaseClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaMariaDb(withConnectionDefaults(databaseUrl)) })
}

// Stryker restore all

// Prisma error codes for "cannot reach the database": P2039 is the MariaDB adapter's pool failing
// to connect (refused, wrong password, unknown database); the rest are the general codes.
const unavailableCodes = new Set(['P2039', 'P2024', 'P1001', 'P1002', 'P1008', 'P1017'])

// A raw query (`$queryRaw`, used by the ping) reports the same failure as P2010 and puts the
// driver's code inside: 45028 is the mariadb driver's "no connection from the pool".
const driverPoolFailure = 45028

function hasProperty<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!hasProperty(error, 'code') || typeof error.code !== 'string') return false
  if (unavailableCodes.has(error.code)) return true
  if (error.code !== 'P2010') return false
  const meta = hasProperty(error, 'meta') ? error.meta : undefined
  const adapterError = hasProperty(meta, 'driverAdapterError') ? meta.driverAdapterError : undefined
  const cause = hasProperty(adapterError, 'cause') ? adapterError.cause : undefined
  return hasProperty(cause, 'code') && cause.code === driverPoolFailure
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

// Stryker disable all: needs a real database; src/shared/database.db.test.ts covers it.
/** Ask the database a trivial question. Throws a 503 when it does not answer (D-32). */
export async function pingDatabase(client: PrismaClient, logger: Logger): Promise<void> {
  await withDatabaseErrors(logger, () => client.$queryRaw`SELECT 1`)
}
