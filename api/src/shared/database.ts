import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client.ts'

export type { PrismaClient }

/**
 * Build the Prisma client for the legacy database (the Node twin of a .NET `DbContext`).
 * Only `server.ts` and the database tests call this; everything else receives the client.
 * The connection opens on the first query, so a down database does not stop startup.
 */
export function createDatabaseClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) })
}
