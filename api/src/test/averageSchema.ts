import { readFileSync } from 'node:fs'

/**
 * The statements in `prisma/average-tables.sql`, one per entry (D-287). Tests run the same file you
 * run on a real database. Comments are dropped, then the text splits on `;`.
 */
export function averageSchemaSql(): string[] {
  const text = readFileSync(new URL('../../prisma/average-tables.sql', import.meta.url), 'utf8')
  return text
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
}
