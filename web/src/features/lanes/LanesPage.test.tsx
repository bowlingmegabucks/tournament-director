import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  createLaneBowler,
  createLanePage,
  createLanePair,
  createSquad,
  createSweeper,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { LanePage } from './types'

const tournament = createTournament({ name: 'Spring Open' })

/** Serve the lane page for the squad or sweeper it describes, with a matching session list for the header. */
function serve(page: LanePage) {
  const { session } = page
  const head = { id: session.id, date: session.date, complete: session.complete }
  server.use(
    http.get('/v1/tournaments/:id', () => HttpResponse.json({ tournament })),
    http.get('/v1/tournaments/:id/squads', () =>
      HttpResponse.json({ squads: session.kind === 'squad' ? [createSquad(head)] : [] }),
    ),
    http.get('/v1/tournaments/:id/sweepers', () =>
      HttpResponse.json({ sweepers: session.kind === 'sweeper' ? [createSweeper(head)] : [] }),
    ),
    http.get('/v1/tournaments/:id/squads/:sessionId/lanes', () => HttpResponse.json(page)),
    http.get('/v1/tournaments/:id/sweepers/:sessionId/lanes', () => HttpResponse.json(page)),
  )
}

const open = (page: LanePage) =>
  renderApp(`/tournaments/${tournament.id}/${page.session.kind}s/${page.session.id}/lanes`)

const pat = createLaneBowler({
  name: 'Pat Nguyen',
  divisionName: 'Women',
  average: 168,
  pins: 47,
})
const carl = createLaneBowler({ name: 'Carl Dubois', average: 205, pins: 14 })
const joe = createLaneBowler({ name: 'Joe Fontaine', position: '1A', pins: 0 })
const dana = createLaneBowler({ name: 'Dana Abbott', position: '2C', pins: 21 })

function filled(): LanePage {
  const full = Array.from({ length: 5 }, (_, index) =>
    createLaneBowler({
      name: `Full ${index}`,
      position: ['3A', '3B', '4C', '4D', '4E'][index] ?? '',
    }),
  )
  return createLanePage({
    pairs: [
      createLanePair(1, [joe, dana]),
      createLanePair(3, full),
      createLanePair(5, []),
      createLanePair(7, []),
      createLanePair(9, []),
    ],
    unassigned: [carl, pat],
    divisions: [
      { id: 'd1', number: 1, name: 'Open', entries: 8 },
      { id: 'd2', number: 2, name: 'Women', entries: 1 },
    ],
  })
}

/** The pair's card: the `li` that holds its level 3 heading. */
async function pairCard(name: RegExp): Promise<HTMLElement> {
  const card = (await screen.findByRole('heading', { level: 3, name }, { timeout: 3000 })).closest(
    'li',
  )
  if (!card) throw new Error('No card')
  return card
}

describe('LanesPage', () => {
  it('shows the bowlers who need a lane and one zone per pair (LAN-10, LAN-03)', async () => {
    const page = filled()
    serve(page)

    open(page)

    expect(
      await screen.findByRole('heading', { name: 'Unassigned (2)' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Lanes (1 to 10)' })).toBeVisible()
    const unassigned = screen.getByRole('region', { name: 'Unassigned bowlers' })
    expect(within(unassigned).getByText('Pat Nguyen')).toBeVisible()
    expect(within(unassigned).getByText('Carl Dubois')).toBeVisible()
    const pairs = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(pairs).toEqual([
      'Lanes 1-2 2 of 5',
      'Lanes 3-4 5 of 5, full',
      'Lanes 5-6 0 of 5',
      'Lanes 7-8 0 of 5',
      'Lanes 9-10 0 of 5',
    ])
  })

  it('lists the bowlers of a pair with their positions, in the order sent (LAN-04)', async () => {
    const page = filled()
    serve(page)

    open(page)

    const card = await pairCard(/Lanes 1-2/)
    expect(
      within(card)
        .getAllByText(/^[1-9]\d?[A-E]$/)
        .map((position) => position.textContent),
    ).toEqual(['1A', '2C'])
    expect(within(card).getByText('Dana Abbott')).toBeVisible()
    expect(within(card).getByText('Open · hdcp 21')).toBeVisible()
  })

  it('says a pair with nobody is empty', async () => {
    const page = filled()
    serve(page)

    open(page)

    expect(within(await pairCard(/Lanes 5-6/)).getByText('No one yet.')).toBeVisible()
  })

  it('shows a squad bowler division, average, and handicap (LAN-11)', async () => {
    const page = filled()
    serve(page)

    open(page)

    expect(
      await screen.findByText('Women · avg 168 · hdcp 47', {}, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('shows a sweeper bowler bonus pins and super sweeper Y or N (LAN-11)', async () => {
    const page = createLanePage({
      session: { ...filled().session, kind: 'sweeper' },
      unassigned: [
        createLaneBowler({ name: 'Pat Nguyen', pins: 10, superSweeper: true, average: 168 }),
        createLaneBowler({ name: 'Carl Dubois', pins: 0, superSweeper: false, average: 205 }),
      ],
    })
    serve(page)

    open(page)

    expect(
      await screen.findByText(
        'Open · avg 168 · +10 pins · super sweeper: Y',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
    expect(screen.getByText('Open · avg 205 · +0 pins · super sweeper: N')).toBeVisible()
  })

  it('says so when a bowler has no average (LAN-11)', async () => {
    const page = createLanePage({ unassigned: [createLaneBowler({ average: null, pins: 0 })] })
    serve(page)

    open(page)

    expect(
      await screen.findByText('Open · no average · hdcp 0', {}, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('counts bowlers per division and the ones who need a lane (LAN-10)', async () => {
    const page = filled()
    serve(page)

    open(page)

    const strip = await screen.findByRole(
      'list',
      { name: 'Bowlers per division' },
      { timeout: 3000 },
    )
    expect(
      within(strip)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Open: 8', 'Women: 1', '9 bowlers, 2 need a lane'])
  })

  it('says everyone has a lane when none is unassigned (LAN-10)', async () => {
    const page = createLanePage({
      pairs: [createLanePair(1, [joe])],
      session: { ...filled().session, numberOfLanes: 2 },
    })
    serve(page)

    open(page)

    expect(
      await screen.findByRole('heading', { name: 'Unassigned (0)' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByText('Everyone has a lane.')).toBeVisible()
  })

  it('says so when nobody has entered the squad (LAN-10)', async () => {
    const page = createLanePage()
    serve(page)

    open(page)

    expect(
      await screen.findByText('No bowlers have entered this squad yet.', {}, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.queryByRole('heading', { name: /Unassigned/ })).not.toBeInTheDocument()
  })

  it('says sweeper for a sweeper (LAN-10)', async () => {
    const page = createLanePage({ session: { ...filled().session, kind: 'sweeper' } })
    serve(page)

    open(page)

    expect(
      await screen.findByText('No bowlers have entered this sweeper yet.', {}, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('says there is nowhere to drop when the session has no lanes (LAN-03)', async () => {
    const page = createLanePage({
      session: { ...filled().session, startingLane: 0, numberOfLanes: 0 },
      pairs: [],
      unassigned: [pat],
    })
    serve(page)

    open(page)

    expect(
      await screen.findByText(
        'This squad has no lanes set, so there is nowhere to drop a bowler. Set its lanes first.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
    expect(screen.getByText('Pat Nguyen')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Drag/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Assign to lanes/ })).not.toBeInTheDocument()
  })

  it('lists positions that fit no pair, with the raw text, and no controls (D-61)', async () => {
    const page = createLanePage({
      session: { ...filled().session, numberOfLanes: 2 },
      pairs: [createLanePair(1, [joe])],
      other: [createLaneBowler({ name: 'Hal Dixon', position: '31A' })],
    })
    serve(page)

    open(page)

    const section = (
      await screen.findByRole('heading', { name: 'Other positions (1)' }, { timeout: 3000 })
    ).closest('section')
    if (!section) throw new Error('No section')
    expect(within(section).getByText('31A')).toBeVisible()
    expect(within(section).getByText('Hal Dixon')).toBeVisible()
    expect(within(section).queryByRole('button')).not.toBeInTheDocument()
    expect(within(section).getByText(/not on a pair of this squad/)).toBeVisible()
  })

  it('shows no "Other positions" area when every position fits (D-61)', async () => {
    const page = filled()
    serve(page)

    open(page)

    await screen.findByRole('heading', { name: 'Unassigned (2)' }, { timeout: 3000 })
    expect(screen.queryByRole('heading', { name: /Other positions/ })).not.toBeInTheDocument()
  })

  it('gives every bowler of an open squad a drag handle and a button (D-58)', async () => {
    const page = filled()
    serve(page)

    open(page)

    expect(
      await screen.findByRole('button', { name: 'Drag Pat Nguyen' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Assign to lanes: Pat Nguyen' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Drag Joe Fontaine' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Move Joe Fontaine' })).toBeVisible()
  })

  it('has no handles or buttons on a complete squad (LAN-13, D-10)', async () => {
    const page = { ...filled(), session: { ...filled().session, complete: true } }
    serve(page)

    open(page)

    expect(
      await screen.findByText(
        'This squad is complete. Lanes cannot change.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible()
    expect(screen.getByText('Pat Nguyen')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('names the page, the session, and the tournament in the title', async () => {
    const page = filled()
    serve(page)

    open(page)

    await screen.findByRole('heading', { name: 'Unassigned (2)' }, { timeout: 3000 })
    await waitFor(() => {
      expect(document.title).toBe(
        'Lane assignments · Sat 10/24/2026 9:00 AM · Spring Open · Tournament Director',
      )
    })
  })

  it('shows the loading state, then the page', async () => {
    const page = filled()
    serve(page)

    open(page)

    expect(
      await screen.findByText('Loading lane assignments…', {}, { timeout: 3000 }),
    ).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'Unassigned (2)' })).toBeVisible()
  })

  it('shows an error and recovers on Try again', async () => {
    const page = filled()
    serve(page)
    // The query retries a failure once by itself, so the first two calls fail.
    let calls = 0
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/lanes', () => {
        calls += 1
        return calls <= 2 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(page)
      }),
    )
    const user = userEvent.setup()

    open(page)

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Failed to load lane assignments (503)',
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Unassigned (2)' })).toBeVisible()
  })

  it('shows the setup message for bowlers per pair out of range, with no retry (LAN-02)', async () => {
    const page = filled()
    serve(page)
    server.use(
      http.get('/v1/tournaments/:id/squads/:sessionId/lanes', () =>
        HttpResponse.json(
          { message: 'Bowlers per pair must be 2 to 5 to assign lanes' },
          { status: 422 },
        ),
      ),
    )

    open(page)

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Bowlers per pair must be 2 to 5 to assign lanes',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})

describe('Assign to lanes dialog (D-58)', () => {
  it('lists the pairs with seats left, and marks a full pair and disables it', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)

    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )

    const dialog = await screen.findByRole('dialog', { name: 'Assign Pat Nguyen to lanes' })
    expect(within(dialog).getByText('Women · avg 168 · hdcp 47')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: /Lanes 1-2/ })).toHaveTextContent(
      '3 seats left (2 of 5)',
    )
    expect(within(dialog).getByRole('button', { name: /Lanes 5-6/ })).toHaveTextContent(
      '5 seats left (0 of 5)',
    )
    const full = within(dialog).getByRole('button', { name: /Lanes 3-4/ })
    expect(full).toBeDisabled()
    expect(full).toHaveTextContent('Full (5 of 5)')
    expect(within(dialog).queryByRole('button', { name: /Unassigned/ })).not.toBeInTheDocument()
  })

  it('says seat, not seats, when one is left', async () => {
    const four = Array.from({ length: 4 }, () => createLaneBowler({ position: '1A' }))
    const page = createLanePage({
      session: { ...filled().session, numberOfLanes: 2 },
      pairs: [createLanePair(1, four)],
      unassigned: [pat],
    })
    serve(page)
    const user = userEvent.setup()
    open(page)

    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )

    expect(await screen.findByRole('button', { name: /Lanes 1-2/ })).toHaveTextContent(
      '1 seat left (4 of 5)',
    )
  })

  it('shows the not-built error for a pick, closes, and moves no one (D-55)', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Assign Pat Nguyen to lanes' })

    await user.click(within(dialog).getByRole('button', { name: /Lanes 5-6/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lane assignment is not built yet. Nothing was saved.',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unassigned (2)' })).toBeVisible()
    expect(within(await pairCard(/Lanes 5-6/)).getByText('No one yet.')).toBeVisible()
  })

  it('offers Unassigned to a bowler who has a lane, and says it is not built (D-57, D-55)', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Move Joe Fontaine' }, { timeout: 3000 }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Move Joe Fontaine to lanes' })

    expect(within(dialog).getByRole('button', { name: /Lanes 1-2/ })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /Lanes 1-2/ })).toHaveTextContent(
      'Current pair',
    )
    await user.click(within(dialog).getByRole('button', { name: /Unassigned/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('not built yet')
  })

  it('closes on Cancel with no error', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )

    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes when the backdrop is clicked, but not when a press inside the box ends there', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Assign Pat Nguyen to lanes' })
    const inside = within(dialog).getByRole('heading', { name: 'Assign Pat Nguyen to lanes' })

    fireEvent.mouseDown(inside)
    fireEvent.click(dialog)
    expect(screen.getByRole('dialog')).toBeVisible()

    fireEvent.click(inside)
    expect(screen.getByRole('dialog')).toBeVisible()

    fireEvent.mouseDown(dialog)
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('dismisses the error toast', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )
    await user.click(await screen.findByRole('button', { name: /Lanes 5-6/ }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
