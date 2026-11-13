import type { PrismaClient } from '../shared/database.ts'
import { DecryptionError, type Encryption } from '../shared/encryption/encryption.ts'

/** What `encryption:check` found. Counts only: never a value, an id, or a name (D-266). */
export interface EncryptionCheckCounts {
  total: number
  /** Stored as `''`: no SSN on file. */
  empty: number
  /** Decrypted to 9 digits, with dashes or spaces allowed: the key works for this row. */
  nineDigits: number
  /** Decrypted, but not to 9 digits: usually a wrong key that passed the padding check by chance. */
  otherText: number
  /** Did not decrypt: a wrong key or a damaged value. */
  failed: number
}

const BATCH = 50

/** Every stored SSN. A raw query, because the client leaves the column out of model reads (BWL-17). */
export async function readStoredValues(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRaw<{ value: string | null }[]>`
    SELECT SocialSecurityNumber AS value FROM Bowlers`
  return rows.map((row) => row.value ?? '')
}

/** Try each value with the key. Batches keep the thread pool busy without a thousand jobs at once. */
export async function checkStoredValues(
  values: readonly string[],
  encryption: Encryption,
): Promise<EncryptionCheckCounts> {
  const counts: EncryptionCheckCounts = {
    total: values.length,
    empty: 0,
    nineDigits: 0,
    otherText: 0,
    failed: 0,
  }
  // Stryker disable next-line EqualityOperator: one extra pass slices nothing, so `<=` changes no result.
  for (let start = 0; start < values.length; start += BATCH) {
    // Batches run one after another on purpose, to cap the thread pool jobs.
    const batch = values.slice(start, start + BATCH).map((v) => classify(v, encryption))
    const outcomes = await Promise.all(batch) // NOSONAR
    for (const outcome of outcomes) counts[outcome]++
  }
  return counts
}

async function classify(
  value: string,
  encryption: Encryption,
): Promise<'empty' | 'nineDigits' | 'otherText' | 'failed'> {
  if (value === '') return 'empty'
  try {
    // Dashes and spaces are a format the desk app may have stored, not a sign of a wrong key.
    // A wrong key that passes the padding check gives random bytes, never nine digits.
    const digits = (await encryption.decrypt(value)).replace(/[-\s]/g, '')
    return /^\d{9}$/.test(digits) ? 'nineDigits' : 'otherText'
  } catch (error) {
    // Anything but a DecryptionError is a bug, not a bad row.
    if (error instanceof DecryptionError) return 'failed'
    throw error
  }
}

/** The lines the script prints. */
export function describeCounts(counts: EncryptionCheckCounts): string[] {
  return [
    `Bowlers checked:          ${counts.total}`,
    `No SSN on file:           ${counts.empty}`,
    `Decrypted to 9 digits:    ${counts.nineDigits}`,
    `Decrypted to other text:  ${counts.otherText}`,
    `Could not decrypt:        ${counts.failed}`,
    hasProblems(counts)
      ? 'PROBLEM: the key does not open every stored value. Check ENCRYPTION_KEY against the desk app.'
      : 'OK: every stored value opens with this key.',
  ]
}

/** Any row that did not decrypt to 9 digits means the key or the data is wrong. */
export function hasProblems(counts: EncryptionCheckCounts): boolean {
  return counts.failed > 0 || counts.otherText > 0
}
