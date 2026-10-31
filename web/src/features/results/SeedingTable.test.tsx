import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createSeedingDivision, createSeedingRow } from '../../mocks/data'
import { SeedingBody } from './SeedingTable'

const division = (overrides = {}) =>
  createSeedingDivision({
    name: 'Open',
    finalists: 1,
    rows: [
      createSeedingRow({ name: 'Joe Fontaine', seed: 1, total: 1402, highGame: 248, handicap: 30 }),
      createSeedingRow({ name: 'Maria Lopez', seed: 2, group: 'other', previousCasher: true }),
    ],
    ...overrides,
  })

describe('SeedingBody (RES-18 to RES-21a, D-92)', () => {
  it('lists the seeds with a Cut Line after the last finalist', () => {
    render(<SeedingBody division={division()} />)

    const table = screen.getByRole('table', { name: 'Finals seeding for the Open division' })
    const rows = within(table).getAllByRole('row')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Seed'),
      expect.stringContaining('#1'),
      'Cut Line',
      expect.stringContaining('#2'),
    ])
  })

  it('hides the HDCP column unless someone has a handicap', () => {
    render(<SeedingBody division={division({ showHandicap: false })} />)

    expect(screen.queryByRole('columnheader', { name: 'HDCP' })).not.toBeInTheDocument()
  })

  it('shows the HDCP column and each handicap', () => {
    render(<SeedingBody division={division({ showHandicap: true })} />)

    expect(screen.getByRole('columnheader', { name: 'HDCP' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('row', { name: /Joe Fontaine/ })).getByText('30'),
    ).toBeInTheDocument()
  })

  it('marks a previous casher (D-07) and no one else', () => {
    render(<SeedingBody division={division()} />)

    expect(
      within(screen.getByRole('row', { name: /Maria Lopez/ })).getByText(/Cashed on a squad/),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('row', { name: /Joe Fontaine/ })).queryByText(/Cashed on a squad/),
    ).not.toBeInTheDocument()
  })

  it('shows a tie mark under the name', () => {
    const tied = division({
      rows: [
        createSeedingRow({
          name: 'Joe Fontaine',
          ties: [{ line: 'cut', outcome: 'full', decidedBy: null }],
        }),
      ],
    })

    render(<SeedingBody division={tied} />)

    expect(
      screen.getByRole('rowheader', { name: /Joe Fontaine.*Full tie at the cut line/ }),
    ).toBeInTheDocument()
  })
})
