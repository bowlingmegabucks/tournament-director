import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { buildCheckIn } from './checkIn'
import { CheckInSheet } from './CheckInSheet'
import { createLaneBowler, createLanePage, createLanePair } from '../../mocks/data'

const page = createLanePage({
  pairs: [
    createLanePair(1, [
      createLaneBowler({
        firstName: 'Joe',
        lastName: 'Fontaine',
        suffix: 'Jr',
        position: '1A',
        divisionName: 'Open',
        average: 212,
        pins: 0,
      }),
    ]),
  ],
  unassigned: [createLaneBowler({ firstName: 'Amy', lastName: 'Adams', average: null, pins: 31 })],
})

function show(kind: 'squad' | 'sweeper', order: 'lane' | 'name') {
  render(
    <CheckInSheet
      tournamentName="Spring Open"
      kind={kind}
      date="2026-10-24T09:00:00"
      order={order}
      groups={buildCheckIn(page, order)}
      printedOn="11/16/2026"
    />,
  )
}

describe('CheckInSheet', () => {
  it('heads the sheet with the session, the order, the count, and the date', () => {
    show('squad', 'lane')

    expect(screen.getByRole('heading', { name: 'Squad check-in' })).toBeInTheDocument()
    expect(
      screen.getByText(/Spring Open · Sat 10\/24\/2026 9:00 AM · Lane order/),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 bowlers/)).toBeInTheDocument()
    expect(screen.getByText(/Printed 11\/16\/2026/)).toBeInTheDocument()
  })

  it('lists each bowler by last name with the suffix, the seat, and a dash for no average', () => {
    show('squad', 'name')

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0] as HTMLElement).getByText('Adams, Amy')).toBeInTheDocument()
    expect(within(rows[0] as HTMLElement).getByText('—')).toBeInTheDocument()
    expect(within(rows[1] as HTMLElement).getByText('Fontaine, Joe, Jr')).toBeInTheDocument()
    expect(within(rows[1] as HTMLElement).getByText('1A')).toBeInTheDocument()
    expect(screen.getByText(/Alphabetical by last name/)).toBeInTheDocument()
  })

  it('groups by lane pair, with no lane last', () => {
    show('squad', 'lane')

    expect(screen.getByRole('columnheader', { name: 'Lanes 1-2' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'No lane' })).toBeInTheDocument()
  })

  it('a squad shows Hdcp and no super sweeper column', () => {
    show('squad', 'lane')

    expect(screen.getByRole('columnheader', { name: 'Hdcp' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Super' })).not.toBeInTheDocument()
  })

  it('a sweeper shows Pins and a super sweeper column', () => {
    show('sweeper', 'lane')

    expect(screen.getByRole('heading', { name: 'Sweeper check-in' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pins' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Super' })).toBeInTheDocument()
    expect(screen.getAllByText('No')).toHaveLength(2)
  })

  it('says "1 bowler" for one', () => {
    render(
      <CheckInSheet
        tournamentName="T"
        kind="squad"
        date="2026-10-24T09:00:00"
        order="name"
        groups={buildCheckIn(createLanePage({ unassigned: [createLaneBowler()] }), 'name')}
        printedOn="x"
      />,
    )

    expect(screen.getByText(/^1 bowler(?!s)/)).toBeInTheDocument()
  })
})
