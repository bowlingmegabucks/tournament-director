import { readFileSync } from 'node:fs'

/**
 * The statements in `prisma/auth-tables.sql`, one per entry. Tests run the same file you run on a
 * real database, so a broken script fails here first. Comments are dropped, then the text splits
 * on `;` (the script has none inside a string).
 */
export function authSchemaSql(): string[] {
  const text = readFileSync(new URL('../../prisma/auth-tables.sql', import.meta.url), 'utf8')
  const withoutComments = text.replace(/--[^\n]*/g, '')
  return withoutComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
}
