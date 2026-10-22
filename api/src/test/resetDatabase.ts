import type { PrismaClient } from '../shared/database.ts'

/**
 * Empty every table, so each test starts from nothing (D-36). Call it in `beforeEach`.
 * It reads the table names from the database, so a new table needs no change here.
 * The .NET twin is Respawn.
 */
export async function resetDatabase(client: PrismaClient): Promise<void> {
  const tables = await client.$queryRaw<{ name: string }[]>`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`

  // One transaction keeps every statement on one connection, where the setting applies.
  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
    for (const { name } of tables) {
      // Names come from information_schema, not from a caller. One at a time: a transaction
      // runs on one connection, which takes one statement at once.
      await tx.$executeRawUnsafe(`DELETE FROM \`${name}\``) // NOSONAR: one connection
    }
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
  })
}
