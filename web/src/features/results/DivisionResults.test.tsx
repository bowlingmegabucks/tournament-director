import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createDivisionResult, createSquadRow } from '../../mocks/data'
import { DivisionBody, DivisionResults, DivisionSummary } from './DivisionResults'

const open = createDivisionResult({
  name: 'Open',
  entries: 2,
  rows: [
    createSquadRow({
      registrationId: 'a',
      name: 'Ann Lee',
      place: 1,
      total: 620,
      scores: [200, 210, 210],
    }),
    createSquadRow({
      registrationId: 'b',
      name: 'Bea Moss',
      place: 2,
      total: 600,
      scores: [200, 200, 200],
    }),
  ],
})

describe('DivisionResults (RES-10, RES-11, D-75)', () => {
  it('names the section after the division and lists the bowlers in place order', () => {
    render(<DivisionResults division={open} games={3} />)

    expect(screen.getByRole('region', { name: 'Open' })).toBeVisible()
    const table = screen.getByRole('table', { name: 'Results for the Open division' })
    const names = within(table)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent)
    expect(names).toEqual(['Ann Lee', 'Bea Moss'])
  })

  it('says so when no one has finished', () => {
    render(<DivisionResults division={createDivisionResult({ name: 'Senior' })} games={3} />)

    expect(screen.getByText('No bowler in this division has finished the squad.')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('DivisionBody', () => {
  it('tags a bowler who advanced earlier and explains the tag', () => {
    const division = createDivisionResult({
      rows: [createSquadRow({ name: 'Ann Lee', advancedEarlier: true })],
    })

    render(<DivisionBody division={division} games={3} />)

    expect(screen.getByText('Advanced earlier')).toBeVisible()
    expect(screen.getByText(/cannot advance again/)).toBeVisible()
  })

  it('tags a bowler flagged did not finish on an open squad', () => {
    const division = createDivisionResult({
      rows: [createSquadRow({ name: 'Cal Ode', dnf: true })],
    })

    render(<DivisionBody division={division} games={3} />)

    expect(screen.getByText('DNF')).toBeVisible()
  })

  it('lists did-not-finish bowlers and no-shows apart, unplaced', () => {
    const division = createDivisionResult({
      rows: [createSquadRow({ name: 'Ann Lee' })],
      didNotFinish: [
        {
          registrationId: 'd',
          name: 'Dee Park',
          total: 200,
          games: 1,
          handicap: 0,
          scores: [200, null, null],
        },
      ],
      noShows: [{ registrationId: 'n', name: 'Ned Shaw' }],
    })

    render(<DivisionBody division={division} games={3} />)

    expect(screen.getByRole('heading', { level: 3, name: 'Did not finish' })).toBeVisible()
    const dnf = screen.getByRole('table', { name: 'Open division, did not finish' })
    expect(within(dnf).getByRole('rowheader', { name: 'Dee Park' })).toBeVisible()
    expect(within(dnf).getByText('1 of 3')).toBeVisible()
    expect(screen.getByRole('heading', { level: 3, name: 'No show' })).toBeVisible()
    expect(screen.getByRole('listitem')).toHaveTextContent('Ned Shaw')
  })

  it('leaves out both sections when no one is in them', () => {
    render(<DivisionBody division={open} games={3} />)

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })

  it('notes a game that is not complete yet', () => {
    const division = createDivisionResult({
      throughGame: 1,
      rows: [
        createSquadRow({ scores: [200, 190, null] }),
        createSquadRow({ scores: [180, null, null] }),
      ],
    })

    render(<DivisionBody division={division} games={3} />)

    expect(screen.getByText(/Game 2 is not complete yet/)).toBeVisible()
  })

  it('leaves the summary to the caller when summary is false', () => {
    const division = createDivisionResult({ entries: 2, rows: open.rows })

    const { container } = render(<DivisionBody division={division} games={3} summary={false} />)

    expect(container.querySelectorAll('p')).toHaveLength(0)
  })
})

describe('DivisionSummary', () => {
  it('draws the counts line', () => {
    const { container } = render(<DivisionSummary division={open} />)

    expect(container.querySelectorAll('p').length).toBeGreaterThan(0)
  })

  it('shows the amount a casher won under the name, and on no other row (PAY-20, D-284)', () => {
    render(
      <DivisionBody
        games={3}
        division={createDivisionResult({
          name: 'Open',
          rows: [
            createSquadRow({ name: 'Ann Lee', place: 1, group: 'advancer' }),
            createSquadRow({ name: 'Bea Moss', place: 2, group: 'casher', payout: '100.00' }),
            createSquadRow({ name: 'Cy Park', place: 3, group: 'other' }),
          ],
        })}
      />,
    )

    expect(
      within(screen.getByRole('row', { name: /Bea Moss/ })).getByText('Payout $100.00'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/^Payout /)).toHaveLength(1)
  })
})
