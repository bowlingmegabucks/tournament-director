import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import { createRegistration, createTournament, createSignedInUser } from '../../mocks/data'
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

function never(): never {
  throw new Error('Expected a value')
}

const filterBox = () => screen.findByRole('searchbox', { name: 'Filter by name or USBC ID' })

// These pages need a permission (D-52), so the tests start signed in.
beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})

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
        squadIds: ['s1', 's2', 's3'],
        sweeperIds: ['w1', 'w2'],
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
      squads: [{ id: 's1', date: '2026-10-24T09:00:00', complete: true, entries: 28 }],
      sweepers: [{ id: 'w1', date: '2026-10-23T19:00:00', complete: false, entries: 35 }],
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

  describe('squad and sweeper popup (REG-28, D-54)', () => {
    const squads = [
      { id: 's1', date: '2026-10-24T09:00:00', complete: true, entries: 2 },
      { id: 's2', date: '2026-10-24T13:00:00', complete: false, entries: 1 },
      { id: 's3', date: '2026-10-25T09:00:00', complete: false, entries: 0 },
    ]
    const sweepers = [
      { id: 'w1', date: '2026-10-23T19:00:00', complete: false, entries: 1 },
      { id: 'w2', date: '2026-10-25T12:00:00', complete: true, entries: 1 },
    ]

    function serveSessions() {
      serve(
        [
          named('Dana', 'Abbott', { squadIds: ['s1', 's2'], sweeperIds: ['w2'] }),
          named('Ray', 'Baptiste', { squadIds: ['s1'], sweeperIds: [] }),
        ],
        { squads, sweepers },
      )
    }

    const countButton = (name: string) => screen.findByRole('button', { name })

    it('makes a count above 0 a button and leaves a 0 as text (REG-28)', async () => {
      serveSessions()
      open()

      expect(await countButton('2 squads, show list')).toBeVisible()
      expect(await countButton('1 sweeper, show list')).toBeVisible()
      expect(await countButton('1 squad, show list')).toBeVisible()
      // Ray has no sweepers: a plain 0, nothing to open.
      expect(screen.getAllByRole('button', { name: /show list/ })).toHaveLength(3)
      const row = (await screen.findByRole('rowheader', { name: 'Ray Baptiste' })).closest('tr')
      expect(within(row as HTMLElement).getByText('0')).toBeVisible()
    })

    it('opens a popup listing the squads the bowler entered, with their status (REG-28)', async () => {
      serveSessions()
      open()

      await userEvent.click(await countButton('2 squads, show list'))

      const popup = await screen.findByRole('dialog', { name: 'Dana Abbott: squads' })
      expect(within(popup).getByText('2 of 3 squads')).toBeVisible()
      expect(
        within(popup)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Sat 10/24/2026 9:00 AMComplete', 'Sat 10/24/2026 1:00 PMOpen'])
    })

    it('lists the sweepers the same way (REG-28)', async () => {
      serveSessions()
      open()

      await userEvent.click(await countButton('1 sweeper, show list'))

      const popup = await screen.findByRole('dialog', { name: 'Dana Abbott: sweepers' })
      expect(within(popup).getByText('1 of 2 sweepers')).toBeVisible()
      expect(
        within(popup)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Sun 10/25/2026 12:00 PMComplete'])
    })

    it('uses the singular when the tournament has one of them (REG-28)', async () => {
      serve([named('Dana', 'Abbott', { sweeperIds: ['w1'] })], {
        squads,
        sweepers: [sweepers[0] ?? never()],
      })
      open()

      await userEvent.click(await countButton('1 sweeper, show list'))

      expect(await screen.findByText('1 of 1 sweeper')).toBeVisible()
    })

    it.each([
      ['the Close button', () => userEvent.click(screen.getByRole('button', { name: 'Close' }))],
      ['a click outside the box', () => userEvent.click(screen.getByRole('dialog'))],
    ])('closes with %s', async (_label, close) => {
      serveSessions()
      open()
      await userEvent.click(await countButton('2 squads, show list'))
      await screen.findByRole('dialog')

      await close()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      // Closed means gone from the page, not just hidden.
      expect(document.querySelector('dialog')).toBeNull()
    })

    it('stays open when the click lands inside the box (REG-28)', async () => {
      serveSessions()
      open()
      await userEvent.click(await countButton('2 squads, show list'))

      await userEvent.click(await screen.findByRole('heading', { name: 'Dana Abbott: squads' }))

      expect(screen.getByRole('dialog')).toBeVisible()
    })

    it('stays open when the click lands on the padding around the content (REG-28)', async () => {
      serveSessions()
      open()
      await userEvent.click(await countButton('2 squads, show list'))
      const content = (await screen.findByRole('dialog')).firstElementChild
      if (!content) throw new Error('The popup has no content wrapper')

      await userEvent.click(content)

      expect(screen.getByRole('dialog')).toBeVisible()
    })

    it('stays open when a drag starts in the box and ends on the backdrop (REG-28)', async () => {
      serveSessions()
      open()
      await userEvent.click(await countButton('2 squads, show list'))
      const dialog = await screen.findByRole('dialog')
      const content = dialog.firstElementChild
      if (!content) throw new Error('The popup has no content wrapper')

      // A browser fires the click on the common ancestor, the dialog, after this drag.
      fireEvent.mouseDown(content)
      fireEvent.mouseUp(dialog)
      fireEvent.click(dialog)

      expect(screen.getByRole('dialog')).toBeVisible()
    })

    it('opens the popup of the bowler whose count was clicked, not the first row (REG-28)', async () => {
      serveSessions()
      open()

      await userEvent.click(await countButton('1 squad, show list'))

      const popup = await screen.findByRole('dialog', { name: 'Ray Baptiste: squads' })
      expect(within(popup).getByText('1 of 3 squads')).toBeVisible()
    })

    it('stays open for a click that was not pressed on the backdrop (REG-28)', async () => {
      serveSessions()
      open()
      await userEvent.click(await countButton('2 squads, show list'))
      const dialog = await screen.findByRole('dialog')
      const content = dialog.firstElementChild
      if (!content) throw new Error('The popup has no content wrapper')

      // No press at all: for example a click made by a script.
      fireEvent.click(dialog)
      // Pressed on the backdrop, but the click landed inside the box.
      fireEvent.mouseDown(dialog)
      fireEvent.click(content)

      expect(screen.getByRole('dialog')).toBeVisible()
    })

    it('keeps showing the live list when the registrations are refetched (REG-28)', async () => {
      const dana = named('Dana', 'Abbott', { squadIds: ['s1', 's2'] })
      let current = [dana]
      server.use(
        http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
        http.get('/v1/tournaments/:id/registrations', () =>
          HttpResponse.json({
            registrations: current,
            summary: { ...emptySummary, registrations: 1, squads, sweepers },
          }),
        ),
      )
      const view = open()
      await userEvent.click(await countButton('2 squads, show list'))
      expect(await screen.findByText('2 of 3 squads')).toBeVisible()

      // A third squad arrives, and the window regains focus.
      current = [{ ...dana, squadIds: ['s1', 's2', 's3'] }]
      fireEvent.focus(window)
      window.dispatchEvent(new Event('visibilitychange'))

      expect(await screen.findByText('3 of 3 squads')).toBeVisible()
      view.unmount()
    })

    it('shows no popup until a count is clicked (REG-28)', async () => {
      serveSessions()
      open()

      await screen.findByRole('table')

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

  describe('needs sign-in (D-46, D-52)', () => {
    it('sends a signed-out visitor to sign-in and shows no bowler', async () => {
      setMockUser(null)
      serve([named('Dana', 'Abbott')])

      open()

      expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
      expect(screen.queryByText('Dana Abbott')).not.toBeInTheDocument()
    })

    it('lets a score keeper in', async () => {
      setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
      serve([named('Dana', 'Abbott')])

      open()

      expect(await screen.findByText('Dana Abbott')).toBeVisible()
    })

    it('tells a signed-in user with no role that the page is off limits', async () => {
      setMockUser(createSignedInUser({ roles: [] }))
      serve([named('Dana', 'Abbott')])

      open()

      expect(await screen.findByText('You do not have permission to view this page.')).toBeVisible()
      expect(screen.queryByText('Dana Abbott')).not.toBeInTheDocument()
    })
  })
})
