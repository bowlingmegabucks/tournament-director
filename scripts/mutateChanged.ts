// Run by CI on pull requests: `node scripts/mutateChanged.ts <web|api> <base ref>`.
// Prints `mode=full|none|some` and, for `some`, `mutate=<comma-separated files>`, for GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { planMutation } from './mutate.ts'

const [folder, base] = process.argv.slice(2)
if (!folder || !base) throw new Error('Usage: mutateChanged.ts <folder> <base ref>')

const config: unknown = JSON.parse(readFileSync(`${folder}/stryker.config.json`, 'utf8'))
const mutate = typeof config === 'object' && config !== null ? Reflect.get(config, 'mutate') : []
const patterns = Array.isArray(mutate) ? mutate.filter((p) => typeof p === 'string') : []

const changed = execFileSync(
  'git',
  ['diff', '--name-only', '--diff-filter=d', '--relative', `${base}...HEAD`, '--', `${folder}/`],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
  .map((file) => file.replace(`${folder}/`, ''))

const plan = planMutation(changed, patterns)
console.log(`mode=${plan.mode}`)
if (plan.mode === 'some') console.log(`mutate=${plan.files.join(',')}`)
