import { readFileSync } from 'node:fs'

/**
 * The statements in `prisma/smart-scholarship-column.sql`, one per entry (SMT-01). Tests run the same
 * file you run on a real database. Comments are dropped, then the text splits on `;`.
 */
export function smartScholarshipSchemaSql(): string[] {
  const text = readFileSync(
    new URL('../../prisma/smart-scholarship-column.sql', import.meta.url),
    'utf8',
  )
  return text
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
}
