import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const css = readFileSync('web/src/features/results/ResultsTable.module.css', 'utf8')

/** The text inside the braces of the first `@media` block that starts with `start`. */
function mediaBody(start: string): string {
  const at = css.indexOf(start)
  assert.notEqual(at, -1, `no ${start} block`)
  const open = css.indexOf('{', at)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') depth -= 1
    if (depth === 0) return css.slice(open + 1, index)
  }
  throw new Error(`unclosed ${start} block`)
}

/** Selectors and declarations of each rule, with comments and extra spacing removed. */
function rulesOf(body: string): { selectors: string[]; declarations: string }[] {
  const plain = body.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')),
    declarations: (match[2] ?? '').replace(/\s+/g, ' ').trim(),
  }))
}

describe('ResultsTable.module.css', () => {
  it('repeats the 40rem card rules for game tables from 40rem to 64rem on screen', () => {
    const phone = rulesOf(mediaBody('@media (max-width: 40rem) {'))
    const wide = rulesOf(mediaBody('@media screen and (min-width: 40.0625rem)'))

    const scoped = phone.map(({ selectors, declarations }) => ({
      selectors: selectors.map((selector) =>
        selector.startsWith('.table')
          ? `.table.games${selector.slice('.table'.length)}`
          : `.games ${selector}`,
      ),
      declarations,
    }))
    assert.deepEqual(wide, scoped)
  })
})
