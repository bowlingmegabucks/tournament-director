import { MariaDbContainer } from '@testcontainers/mariadb'
import type { TestProject } from 'vitest/node'
import { createDatabaseClient } from '../shared/database.ts'
import { legacySchemaSql } from './legacySchema.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

/**
 * Start one MariaDB for the whole `db` test run (D-35, D-36). Needs Docker.
 * The version matches production and the Compose file.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new MariaDbContainer('mariadb:11.4.7').start()
  const databaseUrl = container.getConnectionUri()

  const client = createDatabaseClient(databaseUrl)
  try {
    for (const statement of legacySchemaSql) {
      await client.$executeRawUnsafe(statement)
    }
  } finally {
    await client.$disconnect()
  }

  project.provide('databaseUrl', databaseUrl)
  return async () => {
    await container.stop()
  }
}
