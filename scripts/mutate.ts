import { matchesGlob } from 'node:path'

/** Files that change how every mutant runs, so a change to one needs the full run. */
const FULL_RUN_FILES =
  /^(stryker\.config\.json|package-lock\.json|tsconfig[^/]*\.json|vitest[^/]*\.ts)$/

export type MutatePlan = { mode: 'full' } | { mode: 'none' } | { mode: 'some'; files: string[] }

/** A file is mutated when the last pattern that matches it is not a `!` pattern, as in Stryker. */
function isMutated(file: string, patterns: readonly string[]): boolean {
  let mutated = false
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!')
    if (matchesGlob(file, negated ? pattern.slice(1) : pattern)) mutated = !negated
  }
  return mutated
}

/**
 * Which files a pull request should mutate. `changed` are paths relative to the folder (web or api)
 * and `patterns` are the `mutate` globs of its `stryker.config.json`. No file left means Stryker has
 * nothing to run and fails, so the caller skips it.
 */
export function planMutation(changed: readonly string[], patterns: readonly string[]): MutatePlan {
  if (changed.some((file) => FULL_RUN_FILES.test(file))) return { mode: 'full' }
  const files = changed.filter((file) => isMutated(file, patterns))
  return files.length === 0 ? { mode: 'none' } : { mode: 'some', files }
}
