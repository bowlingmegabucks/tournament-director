import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  createDivisionResult,
  createSquadResults,
  createSquadRow,
  createSweeperResults,
  createSweeperRow,
} from '../../mocks/data'
import { PrintResults } from './PrintResults'

const squad = createSquadResults({
  session: { ...createSquadResults().session, date: '2026-10-24T09:00:00', games: 3 },
  divisions: [
    createDivisionResult({
      name: 'Open',
      entries: 3,
      rows: [
        createSquadRow({ name: 'Dave Kowalski', place: 1, group: 'advancer', total: 735 }),
        createSquadRow({ name: 'Marcus Reyes', place: 2, group: 'other', total: 717 }),
      ],
      didNotFinish: [
        {
          registrationId: 'r1',
          name: 'Bob Whitaker',
          total: 445,
          highGame: 230,
          games: 2,
          handicap: 0,
        },
      ],
    }),
    createDivisionResult({
      name: 'Women',
      entries: 1,
      showHandicap: true,
      rows: [createSquadRow({ name: 'Linda Perrault', place: 1, group: 'casher', handicap: 24 })],
    }),
  ],
})

describe('PrintResults (RES-33, RPT-01, D-78)', () => {
  it('prints each division in a section of its own, with the title, date, and division', () => {
    render(<PrintResults results={squad} />)

    const sections = screen.getAllByRole('region', { hidden: true })
    expect(sections).toHaveLength(2)
    expect(within(sections[0] as HTMLElement).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Squad Results',
    )
    expect(
      within(sections[0] as HTMLElement).getByText('Date: 10/24/2026 - 09:00 AM'),
    ).toBeInTheDocument()
    expect(within(sections[0] as HTMLElement).getByText('Division: Open')).toBeInTheDocument()
    expect(within(sections[1] as HTMLElement).getByText('Division: Women')).toBeInTheDocument()
  })

  it('shows the division table, with its sections, under the header', () => {
    render(<PrintResults results={squad} />)

    const [open, women] = screen.getAllByRole('region', { hidden: true }) as HTMLElement[]
    expect(
      within(open as HTMLElement).getByRole('table', { name: 'Results for the Open division' }),
    ).toBeInTheDocument()
    expect(within(open as HTMLElement).getByText('Dave Kowalski')).toBeInTheDocument()
    expect(
      within(open as HTMLElement).getByRole('heading', { level: 3, name: 'Did not finish' }),
    ).toBeInTheDocument()
    expect(
      within(women as HTMLElement).getByRole('columnheader', { name: 'HDCP' }),
    ).toBeInTheDocument()
    expect(within(women as HTMLElement).queryByText('Dave Kowalski')).not.toBeInTheDocument()
  })

  it('carries the sponsor image on every page', () => {
    render(<PrintResults results={squad} />)

    expect(
      screen.getAllByRole('img', {
        name: 'Northeast MegaBuck$ Tournament and sponsors',
        hidden: true,
      }),
    ).toHaveLength(2)
  })

  it('sits on the body outside the app, marked as the print copy', () => {
    const { baseElement } = render(<PrintResults results={squad} />)

    const copy = baseElement.querySelector('[data-results-print-copy]')
    expect(copy?.parentElement).toBe(document.body)
  })

  it('prints a sweeper as one list with no division line', () => {
    const sweeper = createSweeperResults({
      session: { ...createSweeperResults().session, date: '2026-10-24T18:00:00' },
      entries: 2,
      cashers: 1,
      cutScore: 712,
      rows: [
        createSweeperRow({ name: 'Dave Kowalski', place: 1, group: 'casher', total: 712 }),
        createSweeperRow({ name: 'Linda Perrault', place: 2, group: 'other', total: 681 }),
      ],
    })

    render(<PrintResults results={sweeper} />)

    expect(screen.getAllByRole('region', { hidden: true })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, hidden: true })).toHaveTextContent(
      'Sweeper Results',
    )
    expect(screen.getByText('Date: 10/24/2026 - 06:00 PM')).toBeInTheDocument()
    expect(screen.queryByText(/^Division:/)).not.toBeInTheDocument()
    expect(screen.getByText('2 entries · Cashing 1 · Cut score 712')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Sweeper results', hidden: true })).toBeInTheDocument()
  })

  it('says "1 entry" for a sweeper with one', () => {
    const sweeper = createSweeperResults({
      entries: 1,
      cashers: 1,
      cutScore: 600,
      rows: [createSweeperRow({ group: 'casher' })],
    })

    render(<PrintResults results={sweeper} />)

    expect(screen.getByText('1 entry · Cashing 1 · Cut score 600')).toBeInTheDocument()
  })
})
