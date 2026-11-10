import { readFileSync } from 'node:fs'

/**
 * The statements in `prisma/score-tables.sql`, one per entry (D-235). Tests run the same file you
 * run on a real database. Comments are dropped, then the text splits on `;`.
 */
export function scoreSchemaSql(): string[] {
  const text = readFileSync(new URL('../../prisma/score-tables.sql', import.meta.url), 'utf8')
  return text
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
}
