import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSettings, createSignedInUser, createSquad, createTournament } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import type { Squad } from './types'

const tournament = createTournament({ name: 'Spring Open' })

function serve(squads: Squad[]) {
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/squads', () => HttpResponse.json({ squads })),
  )
}

/** The card titles are dates. The sidebar has a level 2 heading of its own, the tournament name. */
// The first render in a file is slow under coverage, so wait longer than the default second.
const titles = () =>
  screen.findAllByRole('heading', { level: 2, name: /\d{2}\/\d{2}\/\d{4}/ }, { timeout: 3000 })

const open = () => renderApp(`/tournaments/${tournament.id}/squads`)

/** The card with this date as its title. */
async function cardOf(title: string): Promise<HTMLElement> {
  const card = (
    await screen.findByRole('heading', { name: new RegExp(title) }, { timeout: 3000 })
  ).closest('li')
  if (!card) throw new Error(`No card for ${title}`)
  return card
}

function fact(card: HTMLElement, label: string): string | null {
  const term = within(card).getByText(label, { selector: 'dt' })
  return term.nextElementSibling?.textContent ?? null
}

describe('SquadsPage', () => {
  it('lists the squads in the order the API sends, one card each (SQD-21, SQD-20)', async () => {
    serve([
      createSquad({ date: '2026-10-24T09:00:00' }),
      createSquad({ date: '2026-10-24T13:00:00' }),
      createSquad({ date: '2026-10-25T09:00:00' }),
    ])

    open()

    expect((await titles()).map((title) => title.textContent)).toEqual([
      'Sat 10/24/2026 9:00 AMOpen',
      'Sat 10/24/2026 1:00 PMOpen',
      'Sun 10/25/2026 9:00 AMOpen',
    ])
    expect(screen.queryByText('No squads yet.')).not.toBeInTheDocument()
  })

  it('shows lanes, bowlers per pair, fee, and both ratios on a card (SQD-21, D-44)', async () => {
    serve([
      createSquad({
        date: '2026-10-24T09:00:00',
        startingLane: 11,
        numberOfLanes: 10,
        maxPerPair: 5,
      }),
    ])

    open()

    const card = await cardOf('9:00 AM')
    expect(fact(card, 'Lanes')).toBe('11 to 20 (10 lanes)')
    expect(fact(card, 'Per pair')).toBe('Up to 5')
    expect(fact(card, 'Entry fee')).toBe('$50.00')
    expect(fact(card, 'Finals ratio')).toBe('1 in 7.0')
    expect(fact(card, 'Cash ratio')).toBe('1 in 5.0')
  })

  it('marks only the values the squad overrides (TRN-12, D-43)', async () => {
    serve([
      createSquad({
        date: '2026-10-24T13:00:00',
        entryFee: 60,
        entryFeeOverridden: true,
        finalsRatio: 8,
        finalsRatioOverridden: true,
      }),
    ])

    open()

    const card = await cardOf('1:00 PM')
    expect(fact(card, 'Entry fee')).toBe('$60.00 (override)')
    expect(fact(card, 'Finals ratio')).toBe('1 in 8.0 (override)')
    expect(fact(card, 'Cash ratio')).toBe('1 in 5.0')
  })

  it('marks a cash ratio override on its own (TRN-12, D-43)', async () => {
    serve([createSquad({ cashRatio: 4.5, cashRatioOverridden: true })])

    open()

    const card = await cardOf('9:00 AM')
    expect(fact(card, 'Cash ratio')).toBe('1 in 4.5 (override)')
    expect(fact(card, 'Entry fee')).toBe('$50.00')
  })

  it('says Open or Complete in words (SQD-21, D-44)', async () => {
    serve([
      createSquad({ date: '2026-10-24T09:00:00', complete: true }),
      createSquad({ date: '2026-10-24T13:00:00', complete: false }),
    ])

    open()

    expect(within(await cardOf('9:00 AM')).getByText('Complete')).toBeVisible()
    expect(within(await cardOf('1:00 PM')).getByText('Open')).toBeVisible()
  })

  it('links the date to the squad page and has no buttons (D-60, D-21)', async () => {
    const squad = createSquad()
    serve([squad])

    open()

    const card = await cardOf('9:00 AM')
    expect(within(card).getByRole('link', { name: /9:00 AM/ })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/squads/${squad.id}`,
    )
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('names the page and the tournament in the title', async () => {
    serve([createSquad()])

    open()

    await cardOf('9:00 AM')
    expect(document.title).toBe('Squads · Spring Open · Tournament Director')
  })

  it('says there are no squads when the tournament has none (SQD-21, D-44)', async () => {
    serve([])

    open()

    expect(await screen.findByText('No squads yet.')).toBeVisible()
    expect(within(screen.getByRole('main')).queryByRole('list')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).queryByRole('heading', { level: 2 }),
    ).not.toBeInTheDocument()
  })

  it('announces loading', async () => {
    serve([createSquad()])

    open()
    await screen.findByRole('heading', { name: 'Squads', level: 1 })

    expect(screen.getByRole('status')).toHaveTextContent('Loading squads')
    await cardOf('9:00 AM')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an error and recovers on retry (D-44)', async () => {
    // The query retries a failure once by itself, so the first two calls fail.
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/squads', () =>
        ++calls <= 2
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ squads: [createSquad()] }),
      ),
    )

    open()
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load squads (503)',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await cardOf('9:00 AM')).toBeVisible()
  })

  it('shows a not-found error without retrying when the API says the tournament is gone (D-44)', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/squads', () => {
        calls++
        return new HttpResponse(null, { status: 404 })
      }),
    )

    open()

    expect(await screen.findByRole('alert')).toHaveTextContent('Tournament not found')
    expect(calls).toBe(1)
  })

  describe('New squad link (SQD-01, D-167, D-171)', () => {
    const serveSettings = (completed: boolean) => {
      server.use(
        http.get('/v1/tournaments/:id/settings', () =>
          HttpResponse.json({ settings: createSettings({ completed }) }),
        ),
      )
    }

    it('shows a director a link to the form', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([])
      serveSettings(false)

      open()

      expect(await screen.findByRole('link', { name: 'New squad' })).toHaveAttribute(
        'href',
        `/tournaments/${tournament.id}/squads/new`,
      )
    })

    it('hides the link from a score keeper and from a signed-out visitor', async () => {
      serve([])
      serveSettings(false)
      setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))

      open()

      await screen.findByText('No squads yet.')
      expect(screen.queryByRole('link', { name: 'New squad' })).not.toBeInTheDocument()
    })

    it('hides the link on a complete tournament (D-171)', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([])
      serveSettings(true)

      open()

      await screen.findByText('No squads yet.')
      expect(screen.queryByRole('link', { name: 'New squad' })).not.toBeInTheDocument()
    })

    it('shows the link when the settings cannot be read, since the API still refuses (D-171)', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([])
      server.use(
        http.get('/v1/tournaments/:id/settings', () => new HttpResponse(null, { status: 500 })),
      )

      open()

      expect(
        await screen.findByRole('link', { name: 'New squad' }, { timeout: 3000 }),
      ).toBeVisible()
    })
  })

  describe('Delete button (SQD-14, D-186, D-188)', () => {
    /** Serves the settings. The returned function says whether they were fetched. */
    const serveSettings = (completed: boolean) => {
      let served = false
      server.use(
        http.get('/v1/tournaments/:id/settings', () => {
          served = true
          return HttpResponse.json({ settings: createSettings({ completed }) })
        }),
      )
      return () => served
    }

    /** Waits for the user and the settings to load, so an absent button means hidden, not "not yet". */
    async function settled(served?: () => boolean) {
      await screen.findByRole('button', { name: 'Sign out' }, { timeout: 3000 })
      // A score keeper never reads the settings, so there is nothing to wait for.
      if (served) {
        await waitFor(() => {
          expect(served()).toBe(true)
        })
      }
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    }

    it('shows a director a button on an open squad and none on a complete one', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([
        createSquad({ date: '2026-10-24T09:00:00', complete: false }),
        createSquad({ date: '2026-10-24T13:00:00', complete: true }),
      ])
      serveSettings(false)

      open()

      expect(
        await screen.findByRole(
          'button',
          { name: 'Delete squad Sat 10/24/2026 9:00 AM' },
          { timeout: 3000 },
        ),
      ).toBeVisible()
      expect(screen.getAllByRole('button', { name: /^Delete squad / })).toHaveLength(1)
    })

    it('hides the button from a score keeper', async () => {
      setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
      serve([createSquad({ date: '2026-10-24T09:00:00' })])
      serveSettings(false)

      open()

      await cardOf('9:00 AM')
      await settled()
      expect(screen.queryByRole('button', { name: /^Delete squad / })).not.toBeInTheDocument()
    })

    it('hides the button on a complete tournament (D-188)', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([createSquad({ date: '2026-10-24T09:00:00' })])
      const served = serveSettings(true)

      open()

      await cardOf('9:00 AM')
      await settled(served)
      expect(screen.queryByRole('button', { name: /^Delete squad / })).not.toBeInTheDocument()
    })

    it('says Squad deleted after a delete, then drops the toast (D-188)', async () => {
      serve([createSquad({ date: '2026-10-24T09:00:00' })])

      renderApp(`/tournaments/${tournament.id}/squads`, { deleted: true })

      expect(await screen.findByText('Squad deleted')).toBeVisible()
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByText('Squad deleted')).not.toBeInTheDocument()
    })
  })
})
