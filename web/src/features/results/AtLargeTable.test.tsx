import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createAtLargeDivision, createAtLargeRow } from '../../mocks/data'
import { AtLargeBody } from './AtLargeTable'

describe('AtLargeBody (RES-12 to RES-17, D-92)', () => {
  it('says so when the division has no at-large spots', () => {
    render(<AtLargeBody division={createAtLargeDivision({ atLargeSpots: 0 })} finalsRatio={8} />)

    expect(screen.getByText('No at-large spots in this division.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says so when spots are open and no one has qualified', () => {
    render(<AtLargeBody division={createAtLargeDivision({ atLargeSpots: 2 })} finalsRatio={8} />)

    expect(screen.getByText('No one has qualified for an at-large spot yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lists each row with its figures and marks a previous casher (D-07)', () => {
    const division = createAtLargeDivision({
      name: 'Women',
      atLargeSpots: 2,
      rows: [
        createAtLargeRow({ name: 'Joe Fontaine', place: 1, total: 1402, highGame: 248 }),
        createAtLargeRow({ name: 'Maria Lopez', place: 2, previousCasher: true }),
      ],
    })

    render(<AtLargeBody division={division} finalsRatio={8} />)

    const table = screen.getByRole('table', { name: 'At-large results for the Women division' })
    const joe = within(table).getByRole('row', { name: /Joe Fontaine/ })
    expect(within(joe).getByText('1402')).toBeInTheDocument()
    expect(within(joe).getByText('248')).toBeInTheDocument()
    expect(within(joe).queryByText(/Cashed on a squad/)).not.toBeInTheDocument()
    const maria = within(table).getByRole('row', { name: /Maria Lopez/ })
    expect(within(maria).getByText(/Cashed on a squad/)).toBeInTheDocument()
  })

  it('shows a tie mark under the name', () => {
    const division = createAtLargeDivision({
      atLargeSpots: 1,
      rows: [
        createAtLargeRow({
          name: 'Joe Fontaine',
          ties: [{ line: 'cut', outcome: 'full', decidedBy: null }],
        }),
      ],
    })

    render(<AtLargeBody division={division} finalsRatio={8} />)

    expect(
      screen.getByRole('rowheader', { name: /Joe Fontaine.*Full tie at the last at-large spot/ }),
    ).toBeInTheDocument()
  })
})
