import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createRecapSheet } from '../../mocks/data'
import { RecapSheet } from './RecapSheet'

const session = { date: '2026-10-24T19:00:00', games: 3 }

function show(sheet = createRecapSheet(), pattern: 'staggered' | 'same' = 'staggered') {
  render(<RecapSheet sheet={sheet} session={session} pattern={pattern} />)
  return within(screen.getByRole('article', { name: `Recap sheet for ${sheet.name}` }))
}

describe('RecapSheet', () => {
  it('shows the date, the time, the name, and the division (RPT-05)', () => {
    const sheet = show(createRecapSheet({ name: 'Joey Royer Jr.', divisionName: '34-52' }))

    expect(sheet.getByText('10/24/2026')).toBeInTheDocument()
    expect(sheet.getByText('07:00 PM')).toBeInTheDocument()
    expect(sheet.getAllByText('Joey Royer Jr.')).toHaveLength(2)
    expect(sheet.getByText('34-52')).toBeInTheDocument()
  })

  it('puts the bowler name under the signature line and the opposing line below it (RPT-05)', () => {
    const sheet = show(createRecapSheet({ name: 'Joey Royer Jr.' }))

    expect(sheet.getAllByText('Joey Royer Jr.').at(-1)).toHaveClass(/bowlerSignature/)
    expect(sheet.getByText("Opposing Bowler's Signature")).toBeInTheDocument()
    expect(sheet.getByText('Office Check: __________')).toBeInTheDocument()
  })

  it('shows the sponsor image with a text that names the tournament (RPT-05, D-63)', () => {
    const sheet = show()

    expect(
      sheet.getByRole('img', { name: /Northeast Megabucks Tournament, with sponsors/ }),
    ).toBeVisible()
  })

  it('lists one row per game and a Totals row, with blank scores (RPT-05a)', () => {
    const sheet = show(
      createRecapSheet({ handicap: 47, cross: { staggered: ['1A', '4A', '7A'], same: [] } }),
    )

    const rows = sheet.getAllByRole('row')
    expect(rows).toHaveLength(5)
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Lane', 'Score', 'Handicap', 'Total'])
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['1A', '', '47', ''])
    expect(within(rows[3] as HTMLElement).getAllByRole('cell')[0]).toHaveTextContent('7A')
    expect(within(rows[4] as HTMLElement).getByRole('rowheader')).toHaveTextContent('Totals')
    expect(
      within(rows[4] as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['', '141', ''])
  })

  it('shows a dash for a handicap of 0, on every row and on Totals (RPT-05a)', () => {
    const sheet = show(createRecapSheet({ handicap: 0 }))

    const dashes = sheet.getAllByText('-')
    expect(dashes).toHaveLength(4)
  })

  it('shows the lanes of the skip pattern chosen (RPT-05a, D-64)', () => {
    const sheet = createRecapSheet({
      cross: { staggered: ['1A', '4A', '7A'], same: ['1A', '4A', '5A'] },
    })

    show(sheet, 'same')

    expect(screen.queryByRole('cell', { name: '7A' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '5A' })).toBeInTheDocument()
  })

  it('repeats a lane without trouble when the cross comes back to it (RPT-05a)', () => {
    const sheet = show(createRecapSheet({ cross: { staggered: ['1A', '4A', '1A'], same: [] } }))

    expect(sheet.getAllByRole('cell', { name: '1A' })).toHaveLength(2)
  })
})
