import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createRegistration, createTournament } from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { Registration, RegistrationList, Summary } from './types'

const tournament = createTournament({ name: 'Spring Open' })

const emptySummary: Summary = {
  registrations: 0,
  superSweepers: 0,
  divisions: [],
  squads: [],
  sweepers: [],
}

function named(
  firstName: string,
  lastName: string,
  fields: Partial<Registration> & { usbcId?: string; suffix?: string } = {},
): Registration {
  const { usbcId = '1234-56789', suffix, ...rest } = fields
  const name = `${firstName} ${lastName}`
  return createRegistration({
    bowler: {
      id: crypto.randomUUID(),
      name: suffix ? `${name}, ${suffix}` : name,
      firstName,
      lastName,
      usbcId,
    },
    ...rest,
  })
}

function serve(registrations: Registration[], summary: Partial<Summary> = {}) {
  const list: RegistrationList = {
    registrations,
    summary: { ...emptySummary, registrations: registrations.length, ...summary },
  }
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/registrations', () => HttpResponse.json(list)),
  )
}

const open = () => renderApp(`/tournaments/${tournament.id}/registrations`)

/** The cells of one bowler's row, after the name: USBC ID, division, squads, sweepers, super sweeper. */
async function cellsOf(name: string): Promise<(string | null)[]> {
  const row = (await screen.findByRole('rowheader', { name })).closest('tr')
  if (!row) throw new Error(`No row for ${name}`)
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

const names = () => screen.getAllByRole('rowheader').map((header) => header.textContent)

const filterBox = () => screen.findByRole('searchbox', { name: 'Filter by name or USBC ID' })

describe('RegistrationsPage', () => {
  it('lists the registrations in the order the API sends, one row each (REG-23)', async () => {
    serve([
      named('Dana', 'Abbott'),
      named('Ray', 'Baptiste', { suffix: 'Jr' }),
      named('Maria', 'Chen'),
    ])

    open()

    const table = await screen.findByRole('table', { name: 'Registrations in Spring Open' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Bowler', 'USBC ID', 'Division', 'Squads', 'Sweepers', 'Super sweeper'])
    expect(names()).toEqual(['Dana Abbott', 'Ray Baptiste, Jr', 'Maria Chen'])
    expect(screen.queryByText('No registrations yet.')).not.toBeInTheDocument()
    expect(screen.queryByText('No registrations match the filter.')).not.toBeInTheDocument()
  })

  it('shows the USBC ID, division, and counts of each bowler (REG-23)', async () => {
    serve([
      named('Dana', 'Abbott', {
        usbcId: '4821-10394',
        divisionName: 'Women',
        squads: 3,
        sweepers: 2,
      }),
    ])

    open()

    expect(await cellsOf('Dana Abbott')).toEqual(['4821-10394', 'Women', '3', '2', 'No'])
  })

  it('shows a dash for an empty USBC ID (REG-23)', async () => {
    serve([named('Tom', 'Delgado', { usbcId: '' })])

    open()

    expect((await cellsOf('Tom Delgado'))[0]).toBe('–')
  })

  it('shows a check mark for a super sweeper entry and is blank for none (REG-23, D-47)', async () => {
    serve([named('Dana', 'Abbott', { superSweeper: true }), named('Ray', 'Baptiste')])

    open()

    const yes = await cellsOf('Dana Abbott')
    expect(yes[4]).toBe('✓Yes')
    expect(await cellsOf('Ray Baptiste')).toEqual(expect.arrayContaining(['No']))
    const row = (await screen.findByRole('rowheader', { name: 'Dana Abbott' })).closest('tr')
    expect(within(row as HTMLElement).getByText('✓')).toHaveAttribute('aria-hidden', 'true')
  })

  it('lists a bowler with two registrations twice (REG-27, D-48)', async () => {
    serve([
      named('Joe', 'Fontaine', { usbcId: '2045-88123' }),
      named('Joe', 'Fontaine', { usbcId: '5560-11902' }),
    ])

    open()

    await screen.findByRole('table')
    expect(names()).toEqual(['Joe Fontaine', 'Joe Fontaine'])
  })

  it('names the page and the tournament in the title', async () => {
    serve([named('Dana', 'Abbott')])

    open()

    await screen.findByRole('table')
    expect(document.title).toBe('Registrations · Spring Open · Tournament Director')
  })

  describe('summary (REG-24, D-50)', () => {
    const summary: Partial<Summary> = {
      registrations: 48,
      superSweepers: 12,
      divisions: [
        { id: 'd1', number: 1, name: 'Open', entries: 61 },
        { id: 'd2', number: 2, name: 'Women', entries: 0 },
      ],
      squads: [{ id: 's1', date: '2026-10-24T09:00:00', entries: 28 }],
      sweepers: [{ id: 'w1', date: '2026-10-23T19:00:00', entries: 35 }],
    }

    function totals() {
      return Object.fromEntries(
        screen
          .getAllByRole('term')
          .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
      )
    }

    function listed(title: string) {
      const group = screen.getByRole('heading', { name: title, level: 3 }).closest('section')
      return within(group as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    }

    it('shows the totals and the entries by division, squad, and sweeper', async () => {
      serve([named('Dana', 'Abbott')], summary)

      open()

      expect(
        await screen.findByRole('heading', { name: 'Entries in this tournament' }),
      ).toBeVisible()
      expect(totals()).toEqual({ 'Bowlers registered': '48', 'Super sweeper': '12' })
      expect(listed('By division')).toEqual(['1 Open61', '2 Women0'])
      expect(listed('By squad')).toEqual(['Sat 10/24/2026 9:00 AM28'])
      expect(listed('By sweeper')).toEqual(['Fri 10/23/2026 7:00 PM35'])
    })

    it('does not change when the grid is filtered', async () => {
      serve([named('Dana', 'Abbott'), named('Ray', 'Baptiste')], summary)
      open()
      await userEvent.type(await filterBox(), 'dana')

      expect(names()).toEqual(['Dana Abbott'])
      expect(totals()['Bowlers registered']).toBe('48')
      expect(listed('By division')).toEqual(['1 Open61', '2 Women0'])
    })
  })

  describe('filter (REG-23, D-49)', () => {
    const everyone = () => [
      named('Dana', 'Abbott', { usbcId: '4821-10394' }),
      named('Joe', 'Fontaine', { usbcId: '2045-88123' }),
      named('Joe', 'Fontaine', { usbcId: '5560-11902' }),
    ]

    it('shows everyone and says so before anything is typed', async () => {
      serve(everyone())

      open()

      await screen.findByRole('table')
      expect(names()).toHaveLength(3)
      expect(screen.getByRole('status')).toHaveTextContent('Showing all 3 registrations.')
    })

    it('narrows the rows as you type, by first name, last name, or USBC ID', async () => {
      serve(everyone())
      open()
      const box = await filterBox()

      await userEvent.type(box, 'joe')
      expect(names()).toEqual(['Joe Fontaine', 'Joe Fontaine'])
      expect(screen.getByRole('status')).toHaveTextContent('Showing 2 of 3 registrations.')

      await userEvent.type(box, ' 2045')
      expect(names()).toEqual(['Joe Fontaine'])
      expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 3 registrations.')
    })

    it('finds a bowler by USBC ID alone', async () => {
      serve(everyone())
      open()

      await userEvent.type(await filterBox(), '4821')

      expect(names()).toEqual(['Dana Abbott'])
    })

    it('says so when nothing matches, and keeps the summary', async () => {
      serve(everyone(), { registrations: 3 })
      open()

      await userEvent.type(await filterBox(), 'zz')

      expect(screen.getByText('No registrations match the filter.')).toBeVisible()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Entries in this tournament' })).toBeVisible()
      expect(screen.getByRole('status')).toHaveTextContent('Showing 0 of 3 registrations.')
    })

    it('clears with the button, which is off while the box is empty', async () => {
      serve(everyone())
      open()
      const box = await filterBox()
      const clear = screen.getByRole('button', { name: 'Clear filter' })
      expect(clear).toBeDisabled()

      await userEvent.type(box, 'dana')
      expect(clear).toBeEnabled()
      await userEvent.click(clear)

      expect(box).toHaveValue('')
      expect(names()).toHaveLength(3)
    })

    it('does not submit the form on Enter', async () => {
      serve(everyone())
      open()
      const submitted: boolean[] = []
      // React listens at the root, so a listener on the document sees the event after its handler.
      document.addEventListener('submit', (event) => submitted.push(event.defaultPrevented), {
        once: true,
      })

      await userEvent.type(await filterBox(), 'dana{Enter}')

      expect(submitted).toEqual([true])
      expect(names()).toEqual(['Dana Abbott'])
    })

    it('counts text of only spaces as no filter', async () => {
      serve(everyone())
      open()

      await userEvent.type(await filterBox(), '  ')

      expect(names()).toHaveLength(3)
      expect(screen.getByRole('status')).toHaveTextContent('Showing all 3 registrations.')
    })

    it('uses the singular for one registration', async () => {
      serve([named('Dana', 'Abbott')])

      open()

      await screen.findByRole('table')
      expect(screen.getByRole('status')).toHaveTextContent('Showing all 1 registration.')
    })

    it('is a labeled search with a hint', async () => {
      serve(everyone())

      open()

      expect(await screen.findByRole('search', { name: 'Filter registrations' })).toBeVisible()
      expect(await filterBox()).toHaveAccessibleDescription(/Several words must all match/)
    })
  })

  it('says there are no registrations when the tournament has none (REG-26)', async () => {
    serve([])

    open()

    expect(await screen.findByText('No registrations yet.')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })

  it('announces loading (D-53)', async () => {
    serve([named('Dana', 'Abbott')])

    open()
    await screen.findByRole('heading', { name: 'Registrations', level: 1 })

    expect(screen.getByRole('status')).toHaveTextContent('Loading registrations')
    expect(screen.queryByText('No registrations yet.')).not.toBeInTheDocument()
    await screen.findByRole('table')
    expect(screen.queryByText(/Loading registrations/)).not.toBeInTheDocument()
  })

  it('shows an error and recovers on retry (REG-26)', async () => {
    // The query retries a failure once by itself, so the first two calls fail.
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/registrations', () =>
        ++calls <= 2
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({
              registrations: [named('Dana', 'Abbott')],
              summary: { ...emptySummary, registrations: 1 },
            }),
      ),
    )

    open()
    // The built-in retry waits about a second before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load registrations (503)',
    )
    expect(screen.queryByText('No registrations yet.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('rowheader', { name: 'Dana Abbott' })).toBeVisible()
  })

  it('shows a not-found error without retrying when the API says the tournament is gone (REG-26)', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/registrations', () => {
        calls++
        return new HttpResponse(null, { status: 404 })
      }),
    )

    open()

    expect(await screen.findByRole('alert')).toHaveTextContent('Tournament not found')
    expect(calls).toBe(1)
  })

  it('has no add, edit, or delete button until sign-in exists (D-47)', async () => {
    serve([named('Dana', 'Abbott')])

    open()

    await screen.findByRole('table')
    expect(
      screen.queryByRole('button', { name: /add|edit|delete|remove/i }),
    ).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByRole('link')).not.toBeInTheDocument()
  })
})
