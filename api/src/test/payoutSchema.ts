import { readFileSync } from 'node:fs'

/**
 * The statements in `prisma/payout-tables.sql`, one per entry (D-281). Tests run the same file you
 * run on a real database. Comments are dropped, then the text splits on `;`.
 */
export function payoutSchemaSql(): string[] {
  const text = readFileSync(new URL('../../prisma/payout-tables.sql', import.meta.url), 'utf8')
  return text
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
}
