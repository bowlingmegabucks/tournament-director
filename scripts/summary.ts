const DETECTED = new Set(['Killed', 'Timeout'])
const UNDETECTED = new Set(['Survived', 'NoCoverage'])

export interface FileResult {
  file: string
  killed: number
  survived: number
  noCoverage: number
  /** Lines of the mutants no test caught, in file order. */
  lines: number[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function startLine(mutant: Record<string, unknown>): number | undefined {
  const start = isRecord(mutant.location) ? mutant.location.start : undefined
  const line = isRecord(start) ? start.line : undefined
  return typeof line === 'number' ? line : undefined
}

function addMutant(result: FileResult, mutant: unknown): void {
  if (!isRecord(mutant) || typeof mutant.status !== 'string') return
  if (DETECTED.has(mutant.status)) {
    result.killed++
    return
  }
  if (!UNDETECTED.has(mutant.status)) return
  if (mutant.status === 'Survived') result.survived++
  else result.noCoverage++
  const line = startLine(mutant)
  if (line !== undefined) result.lines.push(line)
}

function readFile(file: string, entry: unknown): FileResult {
  const result: FileResult = { file, killed: 0, survived: 0, noCoverage: 0, lines: [] }
  const mutants = isRecord(entry) && Array.isArray(entry.mutants) ? entry.mutants : []
  for (const mutant of mutants) addMutant(result, mutant)
  result.lines.sort((a, b) => a - b)
  return result
}

/** Reads the `files` of a Stryker JSON report (mutation-testing-elements schema). */
export function readReport(report: unknown): FileResult[] {
  const files = isRecord(report) ? report.files : undefined
  if (!isRecord(files)) return []
  return Object.entries(files).map(([file, entry]) => readFile(file, entry))
}

/** Stryker's score: caught mutants over caught and uncaught ones. `undefined`: none counted. */
export function score(results: readonly FileResult[]): number | undefined {
  const killed = results.reduce((sum, r) => sum + r.killed, 0)
  const missed = results.reduce((sum, r) => sum + r.survived + r.noCoverage, 0)
  return killed + missed === 0 ? undefined : (killed / (killed + missed)) * 100
}

const MAX_FILES = 10
const MAX_LINES = 8

/** The pull request comment. `marker` is hidden text that lets the workflow find and update it. */
export function formatSummary(
  folder: string,
  results: readonly FileResult[],
  runUrl: string,
  scope: 'changed' | 'all',
): string {
  const total = score(results)
  const killed = results.reduce((sum, r) => sum + r.killed, 0)
  const survived = results.reduce((sum, r) => sum + r.survived, 0)
  const noCoverage = results.reduce((sum, r) => sum + r.noCoverage, 0)
  const lines = [`<!-- mutation-${folder} -->`, `### Mutation tests (${folder})`, '']
  const scopeNote = scope === 'changed' ? ' · the files this pull request changed' : ''
  if (total === undefined) {
    lines.push('No mutants were counted.')
  } else {
    lines.push(
      `**Score ${total.toFixed(2)}%** · ${killed} caught · ${survived} survived · ${noCoverage} not covered${scopeNote}`,
    )
  }
  const weak = results
    .filter((r) => r.survived + r.noCoverage > 0)
    .sort((a, b) => b.survived + b.noCoverage - (a.survived + a.noCoverage))
  if (weak.length > 0) {
    lines.push('', '| File | Survived | Not covered | Lines |', '| --- | ---: | ---: | --- |')
    for (const r of weak.slice(0, MAX_FILES)) {
      const shown = r.lines.slice(0, MAX_LINES).join(', ')
      const more = r.lines.length > MAX_LINES ? ', …' : ''
      lines.push(`| ${r.file} | ${r.survived} | ${r.noCoverage} | ${shown}${more} |`)
    }
    if (weak.length > MAX_FILES) lines.push('', `…and ${weak.length - MAX_FILES} more files.`)
  }
  lines.push('', `[Full report](${runUrl}): download the \`${folder}-mutation-report\` artifact.`)
  return lines.join('\n')
}
