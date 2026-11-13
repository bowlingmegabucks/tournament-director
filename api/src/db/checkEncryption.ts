import { loadEncryptionCheckConfig } from '../config.ts'
import { createDatabaseClient } from '../shared/database.ts'
import { createEncryption } from '../shared/encryption/encryption.ts'
import {
  checkStoredValues,
  describeCounts,
  hasProblems,
  readStoredValues,
} from './checkEncryptionCore.ts'
import { describeDatabase } from './localDatabase.ts'

// Run with `npm run encryption:check`. It reads DATABASE_URL and ENCRYPTION_KEY from .env, or from
// the environment (set both to check production data). It prints counts only, never a value (D-266).
const { databaseUrl, encryptionKey } = loadEncryptionCheckConfig()
const client = createDatabaseClient(databaseUrl)
try {
  console.log(`Database: ${describeDatabase(databaseUrl)}`)
  const counts = await checkStoredValues(
    await readStoredValues(client),
    createEncryption(encryptionKey),
  )
  for (const line of describeCounts(counts)) console.log(line)
  if (hasProblems(counts)) process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.$disconnect()
}
