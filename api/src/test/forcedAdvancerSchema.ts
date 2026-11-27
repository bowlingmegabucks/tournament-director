import { readFileSync } from 'node:fs'

/**
 * The statements in `prisma/forced-advancer-column.sql`, one per entry (NSH-20). Tests run the same
 * file you run on a real database. Comments are dropped, then the text splits on `;`.
 */
export function forcedAdvancerSchemaSql(): string[] {
  const text = readFileSync(
    new URL('../../prisma/forced-advancer-column.sql', import.meta.url),
    'utf8',
  )
  return text
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
}
