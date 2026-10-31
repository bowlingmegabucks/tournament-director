// Run by CI after the mutation tests: `node scripts/mutationSummary.ts <web|api> <report.json> <run url> <changed|all>`.
// Prints the pull request comment as markdown.
import { readFileSync } from 'node:fs'
import { formatSummary, readReport } from './summary.ts'

const [folder, path, runUrl, scope] = process.argv.slice(2)
if (!folder || !path || !runUrl) {
  throw new Error('Usage: mutationSummary.ts <folder> <report.json> <run url> <changed|all>')
}

const report: unknown = JSON.parse(readFileSync(path, 'utf8'))
console.log(formatSummary(folder, readReport(report), runUrl, scope === 'all' ? 'all' : 'changed'))
