import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  createAtLargeDivision,
  createAtLargeResults,
  createSeedingDivision,
  createSeedingResults,
  createSuperSweeperResults,
} from '../../mocks/data'
import { PrintAtLarge, PrintSeeding, PrintSuperSweeper } from './PrintFinals'

const copy = () => document.body.querySelector('[data-results-print-copy]')
const sheets = () => [...document.body.querySelectorAll('section')]

afterEach(cleanup)

describe('PrintAtLarge (RPT-04c, D-89)', () => {
  const results = (complete: boolean) =>
    createAtLargeResults({
      complete,
      divisions: [
        createAtLargeDivision({ id: 'a', name: 'Open' }),
        createAtLargeDivision({ id: 'b', name: 'Women' }),
      ],
    })

  it('prints one sheet for each division, in a portal on the body', () => {
    const { container } = render(<PrintAtLarge results={results(true)} />)

    expect(container).toBeEmptyDOMElement()
    expect(copy()).not.toBeNull()
    expect(sheets().map((s) => s.getAttribute('aria-label'))).toEqual([
      'Open division',
      'Women division',
    ])
    expect(copy()?.textContent).toContain('Division: Women')
  })

  it('prints only the division named', () => {
    render(<PrintAtLarge results={results(true)} only="b" />)

    expect(sheets().map((s) => s.getAttribute('aria-label'))).toEqual(['Women division'])
  })

  it('marks every sheet unofficial until the results are complete (D-88)', () => {
    render(<PrintAtLarge results={results(false)} />)

    expect(copy()?.textContent?.match(/UNOFFICIAL RESULTS/g)).toHaveLength(2)
  })

  it('leaves the mark off complete results', () => {
    render(<PrintAtLarge results={results(true)} />)

    expect(copy()?.textContent).not.toContain('UNOFFICIAL RESULTS')
  })
})

describe('PrintSeeding (RPT-04d, D-89)', () => {
  const results = createSeedingResults({
    complete: false,
    divisions: [
      createSeedingDivision({ id: 'a', name: 'Open' }),
      createSeedingDivision({ id: 'b', name: 'Women' }),
    ],
  })

  it('prints one sheet for each division with the title', () => {
    render(<PrintSeeding results={results} />)

    expect(sheets()).toHaveLength(2)
    expect(copy()?.textContent).toContain('Finals Seeding')
    expect(copy()?.textContent).toContain('UNOFFICIAL RESULTS')
  })

  it('prints only the division named', () => {
    render(<PrintSeeding results={results} only="a" />)

    expect(sheets().map((s) => s.getAttribute('aria-label'))).toEqual(['Open division'])
  })
})

describe('PrintSuperSweeper (RPT-04b, D-89)', () => {
  it('prints one sheet with the counts and the cut score', () => {
    render(
      <PrintSuperSweeper
        results={createSuperSweeperResults({
          complete: true,
          entries: 12,
          cashers: 3,
          cutScore: 1180,
        })}
      />,
    )

    expect(sheets().map((s) => s.getAttribute('aria-label'))).toEqual(['Super sweeper results'])
    expect(copy()?.textContent).toContain('12 entries · Cashing 3 · Cut score 1180')
    expect(copy()?.textContent).not.toContain('UNOFFICIAL RESULTS')
  })

  it('says 1 entry for a single bowler and marks open results unofficial', () => {
    render(<PrintSuperSweeper results={createSuperSweeperResults({ entries: 1 })} />)

    expect(copy()?.textContent).toContain('1 entry ·')
    expect(copy()?.textContent).toContain('UNOFFICIAL RESULTS')
  })
})
