import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createSuperSweeperResults, createSuperSweeperRow } from '../../mocks/data'
import { SuperSweeperTable } from './SuperSweeperTable'

describe('SuperSweeperTable (RES-29a, D-90)', () => {
  it('has place, name, +/-, sweeper, a column for each game, total, and cumulative', () => {
    render(<SuperSweeperTable results={createSuperSweeperResults()} />)

    const table = screen.getByRole('table', { name: 'Super sweeper results' })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(9)
  })

  it('lists each bowler with the division and totals', () => {
    const results = createSuperSweeperResults({
      rows: [
        createSuperSweeperRow({
          name: 'Joe Fontaine',
          divisionName: 'Women',
          total: 1234,
          sweeperTotals: [600, 634],
          sweeperScores: [
            [200, 200, 200],
            [210, 220, 204],
          ],
        }),
      ],
    })

    render(<SuperSweeperTable results={results} />)

    const row = screen.getByRole('row', { name: /Joe Fontaine/ })
    expect(within(row).getByText(/Women/)).toBeInTheDocument()
    for (const figure of ['600', '634', '1234', '210', '220', '204']) {
      expect(screen.getByText(figure)).toBeInTheDocument()
    }
  })

  it('adds the handicap totals when only one bowler has bonus pins on only one sweeper', () => {
    const results = createSuperSweeperResults({
      rows: [
        createSuperSweeperRow({ sweeperPins: [0, 0], sweeperTotals: [600, 600] }),
        createSuperSweeperRow({ sweeperPins: [0, 6], sweeperTotals: [600, 600] }),
      ],
    })

    render(<SuperSweeperTable results={results} />)

    const names = within(screen.getByRole('table', { name: 'Super sweeper results' }))
      .getAllByRole('columnheader')
      .map((header) => header.textContent)
    expect(names).toEqual(expect.arrayContaining(['Scratch Total', 'Total HDCP', 'HDCP Total']))
  })

  it('keeps one Total when no sweeper has bonus pins', () => {
    const results = createSuperSweeperResults({
      rows: [createSuperSweeperRow({ sweeperPins: [0, 0] })],
    })

    render(<SuperSweeperTable results={results} />)

    expect(screen.queryByRole('columnheader', { name: 'HDCP Total' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeVisible()
  })
})
