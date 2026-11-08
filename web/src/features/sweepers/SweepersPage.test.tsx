import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createSettings,
  createSignedInUser,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import type { BonusPins, Sweeper } from './types'

const tournament = createTournament({ name: 'Spring Open' })

function serve(sweepers: Sweeper[]) {
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/sweepers', () => HttpResponse.json({ sweepers })),
  )
}

/** The card titles are dates. The sidebar has a level 2 heading of its own, the tournament name. */
// The first render in a file is slow under coverage, so wait longer than the default second.
const titles = () =>
  screen.findAllByRole('heading', { level: 2, name: /\d{2}\/\d{2}\/\d{4}/ }, { timeout: 3000 })

const open = () => renderApp(`/tournaments/${tournament.id}/sweepers`)

function pins(divisionName: string, bonusPinsPerGame: number): BonusPins {
  return { divisionId: crypto.randomUUID(), divisionName, bonusPinsPerGame }
}

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

describe('SweepersPage', () => {
  it('lists the sweepers in the order the API sends, one card each (SQD-22, SQD-20)', async () => {
    serve([
      createSweeper({ date: '2026-10-24T18:00:00' }),
      createSweeper({ date: '2026-10-25T17:00:00', complete: true }),
    ])

    open()

    expect((await titles()).map((title) => title.textContent)).toEqual([
      'Sat 10/24/2026 6:00 PMOpen',
      'Sun 10/25/2026 5:00 PMComplete',
    ])
    expect(screen.queryByText('No sweepers yet.')).not.toBeInTheDocument()
  })

  it("shows the sweeper's own fee, games, cash ratio, lanes, and bowlers per pair (SQD-22, D-43)", async () => {
    serve([createSweeper({ entryFee: 27.5, games: 4, cashRatio: 4.5, numberOfLanes: 12 })])

    open()

    const card = await cardOf('6:00 PM')
    expect(fact(card, 'Entry fee')).toBe('$27.50')
    expect(fact(card, 'Games')).toBe('4')
    expect(fact(card, 'Cash ratio')).toBe('1 in 4.5')
    expect(fact(card, 'Lanes')).toBe('1 to 12 (12 lanes)')
    expect(fact(card, 'Per pair')).toBe('Up to 4')
    expect(within(card).queryByText(/override/)).not.toBeInTheDocument()
  })

  it('lists the divisions that have bonus pins, signed (SQD-22, DIV-14)', async () => {
    serve([createSweeper({ bonusPins: [pins('Open', 10), pins('Women', 6), pins('Seniors', -2)] })])

    open()

    const card = await cardOf('6:00 PM')
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Open: +10', 'Women: +6', 'Seniors: -2'])
    expect(
      within(card).getByRole('heading', { name: 'Bonus pins per game', level: 3 }),
    ).toBeVisible()
    expect(within(card).queryByText('No bonus pins')).not.toBeInTheDocument()
  })

  it('says No bonus pins when no division has any (D-45)', async () => {
    serve([createSweeper({ bonusPins: [] })])

    open()

    const card = await cardOf('6:00 PM')
    expect(within(card).getByText('No bonus pins')).toBeVisible()
    expect(within(card).queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('keeps each sweeper’s pins on its own card (D-45)', async () => {
    serve([
      createSweeper({ date: '2026-10-24T18:00:00', bonusPins: [pins('Open', 10)] }),
      createSweeper({ date: '2026-10-25T17:00:00', bonusPins: [pins('Women', 6)] }),
    ])

    open()

    const first = await cardOf('6:00 PM')
    const second = await cardOf('5:00 PM')
    expect(within(first).getByText('Open: +10')).toBeVisible()
    expect(within(first).queryByText('Women: +6')).not.toBeInTheDocument()
    expect(within(second).getByText('Women: +6')).toBeVisible()
  })

  it('links the date to the sweeper page and has no buttons (D-60, D-21)', async () => {
    const sweeper = createSweeper()
    serve([sweeper])

    open()

    const card = await cardOf('6:00 PM')
    expect(within(card).getByRole('link', { name: /6:00 PM/ })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/sweepers/${sweeper.id}`,
    )
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('names the page and the tournament in the title', async () => {
    serve([createSweeper()])

    open()

    await screen.findByRole('heading', { name: /6:00 PM/ })
    expect(document.title).toBe('Sweepers · Spring Open · Tournament Director')
  })

  it('says there are no sweepers when the tournament has none (SQD-22, D-44)', async () => {
    serve([])

    open()

    expect(await screen.findByText('No sweepers yet.')).toBeVisible()
    expect(within(screen.getByRole('main')).queryByRole('list')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).queryByRole('heading', { level: 2 }),
    ).not.toBeInTheDocument()
  })

  it('announces loading', async () => {
    serve([createSweeper()])

    open()
    await screen.findByRole('heading', { name: 'Sweepers', level: 1 })

    expect(screen.getByRole('status')).toHaveTextContent('Loading sweepers')
    await screen.findByRole('heading', { name: /6:00 PM/ })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an error and recovers on retry (D-44)', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/sweepers', () =>
        ++calls <= 2
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ sweepers: [createSweeper()] }),
      ),
    )

    open()
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load sweepers (503)',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: /6:00 PM/ })).toBeVisible()
  })

  it('shows a not-found error without retrying when the API says the tournament is gone (D-44)', async () => {
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
      http.get('/v1/tournaments/:id/sweepers', () => {
        calls++
        return new HttpResponse(null, { status: 404 })
      }),
    )

    open()

    expect(await screen.findByRole('alert')).toHaveTextContent('Tournament not found')
    expect(calls).toBe(1)
  })

  it('links to the super sweeper results above the cards (D-87)', async () => {
    serve([createSweeper()])

    open()

    await titles()
    expect(screen.getByRole('link', { name: 'Super sweeper results' })).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/super-sweeper`,
    )
  })

  it('hides the super sweeper link when there are no sweepers (D-87)', async () => {
    serve([])

    open()

    expect(await screen.findByText('No sweepers yet.', {}, { timeout: 3000 })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Super sweeper results' })).not.toBeInTheDocument()
  })

  describe('New sweeper link (SQD-10, D-174, D-171)', () => {
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

      expect(await screen.findByRole('link', { name: 'New sweeper' })).toHaveAttribute(
        'href',
        `/tournaments/${tournament.id}/sweepers/new`,
      )
    })

    it('hides the link from a score keeper and from a signed-out visitor', async () => {
      serve([])
      serveSettings(false)
      setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))

      open()

      await screen.findByText('No sweepers yet.')
      expect(screen.queryByRole('link', { name: 'New sweeper' })).not.toBeInTheDocument()
    })

    it('hides the link on a complete tournament (D-171)', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([])
      serveSettings(true)

      open()

      await screen.findByText('No sweepers yet.')
      expect(screen.queryByRole('link', { name: 'New sweeper' })).not.toBeInTheDocument()
    })

    it('shows the link when the settings cannot be read, since the API still refuses (D-171)', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([])
      server.use(
        http.get('/v1/tournaments/:id/settings', () => new HttpResponse(null, { status: 500 })),
      )

      open()

      expect(
        await screen.findByRole('link', { name: 'New sweeper' }, { timeout: 3000 }),
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

    it('shows a director a button on an open sweeper and none on a complete one', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([
        createSweeper({ date: '2026-10-24T09:00:00', complete: false }),
        createSweeper({ date: '2026-10-24T13:00:00', complete: true }),
      ])
      serveSettings(false)

      open()

      expect(
        await screen.findByRole(
          'button',
          { name: 'Delete sweeper Sat 10/24/2026 9:00 AM' },
          { timeout: 3000 },
        ),
      ).toBeVisible()
      expect(screen.getAllByRole('button', { name: /^Delete sweeper / })).toHaveLength(1)
    })

    it('hides the button from a score keeper', async () => {
      setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
      serve([createSweeper({ date: '2026-10-24T09:00:00' })])
      serveSettings(false)

      open()

      await cardOf('9:00 AM')
      await settled()
      expect(screen.queryByRole('button', { name: /^Delete sweeper / })).not.toBeInTheDocument()
    })

    it('hides the button on a complete tournament (D-188)', async () => {
      setMockUser(createSignedInUser({ roles: ['director'] }))
      serve([createSweeper({ date: '2026-10-24T09:00:00' })])
      const served = serveSettings(true)

      open()

      await cardOf('9:00 AM')
      await settled(served)
      expect(screen.queryByRole('button', { name: /^Delete sweeper / })).not.toBeInTheDocument()
    })

    it('says Sweeper deleted after a delete, then drops the toast (D-188)', async () => {
      serve([createSweeper({ date: '2026-10-24T09:00:00' })])

      renderApp(`/tournaments/${tournament.id}/sweepers`, { deleted: true })

      expect(await screen.findByText('Sweeper deleted')).toBeVisible()
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByText('Sweeper deleted')).not.toBeInTheDocument()
    })
  })
})
