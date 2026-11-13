import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createSweeperRow } from '../../mocks/data'
import { SweeperTable } from './SweeperTable'

const headers = () =>
  within(screen.getByRole('table', { name: 'Sweeper results' }))
    .getAllByRole('columnheader')
    .map((header) => header.textContent)

describe('SweeperTable (RES-22, RES-25a, D-82)', () => {
  it('has one Total and no handicap columns when no one has bonus pins', () => {
    render(<SweeperTable rows={[createSweeperRow({ bonusPins: 0 })]} games={3} />)

    expect(headers()).toContain('Total')
    expect(headers()).not.toContain('HDCP Total')
    expect(headers()).not.toContain('Scratch Total')
  })

  it('has the three handicap totals once any bowler has bonus pins', () => {
    render(
      <SweeperTable
        rows={[createSweeperRow({ bonusPins: 0 }), createSweeperRow({ bonusPins: 8 })]}
        games={3}
      />,
    )

    expect(headers()).toEqual(expect.arrayContaining(['Scratch Total', 'Total HDCP', 'HDCP Total']))
    expect(headers()).not.toContain('Total')
  })

  it('counts a bowler with one bonus pin as handicap, not scratch', () => {
    render(<SweeperTable rows={[createSweeperRow({ bonusPins: 1 })]} games={3} />)

    expect(headers()).toContain('HDCP Total')
  })

  it('names the games G1 to G3 with the first as G1', () => {
    render(<SweeperTable rows={[createSweeperRow({ scores: [200, 190, 180] })]} games={3} />)

    expect(headers()).toEqual(expect.arrayContaining(['G1', 'G2', 'G3']))
    expect(headers()).not.toContain('G0')
    expect(headers()).not.toContain('G4')
  })

  it('stretches the Cash Line across every column of a scratch table', () => {
    render(
      <SweeperTable
        rows={[
          createSweeperRow({ group: 'casher', name: 'First Casher' }),
          createSweeperRow({ group: 'other', name: 'Other One' }),
        ]}
        games={3}
      />,
    )

    const line = screen.getByRole('cell', { name: 'Cash Line' })
    // Place, name, +/-, three games, and one total.
    expect(line).toHaveAttribute('colspan', '7')
  })

  it('stretches the Cash Line across every column of a handicap table', () => {
    render(
      <SweeperTable
        rows={[
          createSweeperRow({ group: 'casher', bonusPins: 5 }),
          createSweeperRow({ group: 'other', bonusPins: 5 }),
        ]}
        games={3}
      />,
    )

    // Place, name, +/-, three games, and three totals.
    expect(screen.getByRole('cell', { name: 'Cash Line' })).toHaveAttribute('colspan', '9')
  })

  it('says a game is not complete yet only when some bowler has a score in it', () => {
    const { rerender } = render(
      <SweeperTable
        rows={[createSweeperRow({ scores: [200, null, null] })]}
        games={3}
        throughGame={1}
      />,
    )
    expect(screen.queryByText(/is not complete yet/)).not.toBeInTheDocument()

    rerender(
      <SweeperTable
        rows={[createSweeperRow({ scores: [200, 190, null] })]}
        games={3}
        throughGame={1}
      />,
    )
    expect(screen.getByText(/Game 2 is not complete yet/)).toBeVisible()
  })

  it('leaves the pending note out when every game counts', () => {
    render(<SweeperTable rows={[createSweeperRow()]} games={3} />)

    expect(screen.queryByText(/is not complete yet/)).not.toBeInTheDocument()
  })
})
