import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatSummary, readReport, score } from './summary.ts'

const mutant = (status: string, line = 1) => ({ status, location: { start: { line, column: 1 } } })

const report = {
  files: {
    'src/a.ts': { mutants: [mutant('Killed'), mutant('Timeout'), mutant('Survived', 9)] },
    'src/b.ts': {
      mutants: [
        mutant('Killed'),
        mutant('NoCoverage', 4),
        mutant('CompileError'),
        mutant('Ignored'),
      ],
    },
    'src/c.ts': { mutants: [mutant('Killed')] },
  },
}

describe('readReport', () => {
  it('counts caught and uncaught mutants and leaves out the rest', () => {
    assert.deepEqual(readReport(report), [
      { file: 'src/a.ts', killed: 2, survived: 1, noCoverage: 0, lines: [9] },
      { file: 'src/b.ts', killed: 1, survived: 0, noCoverage: 1, lines: [4] },
      { file: 'src/c.ts', killed: 1, survived: 0, noCoverage: 0, lines: [] },
    ])
  })

  it('reads nothing from something that is not a report', () => {
    assert.deepEqual(readReport(undefined), [])
    assert.deepEqual(readReport({ files: 3 }), [])
    assert.deepEqual(
      readReport({ files: { 'a.ts': 1, 'b.ts': { mutants: [1, { status: 2 }] } } }).map(
        (r) => r.killed,
      ),
      [0, 0],
    )
  })

  it('sorts the lines', () => {
    const result = readReport({
      files: { 'a.ts': { mutants: [mutant('Survived', 7), mutant('Survived', 2)] } },
    })
    assert.deepEqual(result[0]?.lines, [2, 7])
  })
})

describe('score', () => {
  it('is caught over caught plus uncaught', () => {
    assert.equal(score(readReport(report)), (4 / 6) * 100)
  })

  it('is undefined with no mutants', () => {
    assert.equal(score([]), undefined)
  })
})

describe('formatSummary', () => {
  const text = formatSummary('web', readReport(report), 'https://x/run/1', 'changed')

  it('starts with a marker for the folder and shows the score', () => {
    assert.ok(text.startsWith('<!-- mutation-web -->\n### Mutation tests (web)'))
    assert.match(
      text,
      /\*\*Score 66\.67%\*\* · 4 caught · 1 survived · 1 not covered · the files this pull request changed/,
    )
  })

  it('lists only files with uncaught mutants', () => {
    assert.match(text, /\| src\/a\.ts \| 1 \| 0 \| 9 \|/)
    assert.match(text, /\| src\/b\.ts \| 0 \| 1 \| 4 \|/)
    assert.doesNotMatch(text, /src\/c\.ts/)
  })

  it('links the run', () => {
    assert.match(text, /\[Full report\]\(https:\/\/x\/run\/1\).*web-mutation-report/)
  })

  it('omits the table when every mutant is caught', () => {
    const clean = formatSummary(
      'api',
      readReport({ files: { 'a.ts': { mutants: [mutant('Killed')] } } }),
      'u',
      'all',
    )
    assert.doesNotMatch(clean, /\| File/)
    assert.doesNotMatch(clean, /changed/)
  })

  it('says so when nothing was counted', () => {
    assert.match(formatSummary('web', [], 'u', 'all'), /No mutants were counted\./)
  })

  it('cuts long lists of files and lines', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      file: `f${i}.ts`,
      killed: 0,
      survived: 1,
      noCoverage: 0,
      lines: Array.from({ length: 10 }, (_, n) => n + 1),
    }))
    const long = formatSummary('web', many, 'u', 'all')
    assert.match(long, /…and 2 more files\./)
    assert.match(long, /1, 2, 3, 4, 5, 6, 7, 8, … \|/)
  })
})
