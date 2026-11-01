import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Text that must never reach a production build (D-104): the dev-only quick-login buttons and the
 * seeded local passwords. Keep the passwords in step with `api/src/db/seedUsers.ts`.
 */
export const forbidden = [
  'adminP4sswordLocal',
  'directorP4sswordLocal',
  'scoreKeeperP4sswordLocal',
  'Log in as admin',
  'Log in as tournament director',
  'Log in as score keeper',
]

/** Every `{ file, text }` in `dir` (searched in all depth) that holds one of the forbidden strings. */
export function scanDist(dir: string): { file: string; text: string }[] {
  const hits: { file: string; text: string }[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      hits.push(...scanDist(path))
      continue
    }
    const content = readFileSync(path, 'utf8')
    for (const text of forbidden) {
      if (content.includes(text)) hits.push({ file: path, text })
    }
  }
  return hits
}
