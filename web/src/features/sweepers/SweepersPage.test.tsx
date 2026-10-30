import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSweeper, createTournament } from '../../mocks/data'
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
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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
})
