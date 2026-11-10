import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createLaneBowler,
  createLanePage,
  createLanePair,
  createRecapSheet,
  createRecapSheets,
  createSignedInUser,
} from '../../mocks/data'
import { carl, filled, joe, open, pat, serve, tournament } from './lanesTestSupport'

/** The pair's card: the `li` that holds its level 3 heading. */
async function pairCard(name: RegExp): Promise<HTMLElement> {
  const card = (await screen.findByRole('heading', { level: 3, name }, { timeout: 3000 })).closest(
    'li',
  )
  if (!card) throw new Error('No card')
  return card
}

// These pages need a permission (D-52), so the tests start signed in.
beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})

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

  it('links to Add registration with this squad pre-selected (REG-22, D-164)', async () => {
    const page = filled()
    serve(page)

    open(page)

    expect(
      await screen.findByRole(
        'link',
        { name: 'Add registration to this squad' },
        { timeout: 3000 },
      ),
    ).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/registrations/new?squad=${page.session.id}`,
    )
  })

  it('links a sweeper with the sweeper pre-selected (REG-22, D-164)', async () => {
    const page = createLanePage({
      session: { ...filled().session, kind: 'sweeper' },
      unassigned: [carl],
    })
    serve(page)

    open(page)

    expect(
      await screen.findByRole(
        'link',
        { name: 'Add registration to this sweeper' },
        { timeout: 3000 },
      ),
    ).toHaveAttribute(
      'href',
      `/tournaments/${tournament.id}/registrations/new?sweeper=${page.session.id}`,
    )
  })

  it('has no Add registration link on a complete squad or for a score keeper (REG-33, D-157)', async () => {
    const complete = { ...filled(), session: { ...filled().session, complete: true } }
    serve(complete)
    const { unmount } = open(complete)
    await screen.findByRole('heading', { name: 'Unassigned (2)' }, { timeout: 3000 })
    expect(screen.queryByRole('link', { name: /Add registration/ })).not.toBeInTheDocument()
    unmount()

    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    const page = filled()
    serve(page)
    open(page)
    await screen.findByRole('heading', { name: 'Unassigned (2)' }, { timeout: 3000 })
    expect(screen.queryByRole('link', { name: /Add registration/ })).not.toBeInTheDocument()
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

  it('counts bowlers per division, the ones who need a lane, and the spots left (LAN-10, D-58)', async () => {
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
    ).toEqual(['Open: 8', 'Women: 1', '9 bowlers, 2 need a lane', '16 of 25 spots open'])
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
    // Printing recap sheets changes nothing, so it stays (D-63).
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Recap sheets'])
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

  it('saves the move and shows the seat the API picked (LAN-20, D-56, D-216)', async () => {
    const page = filled()
    const server = serve(page)
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Assign Pat Nguyen to lanes' })

    await user.click(within(dialog).getByRole('button', { name: /Lanes 5-6/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unassigned (1)' })).toBeVisible()
    const pair = await pairCard(/Lanes 5-6/)
    expect(within(pair).getByText('Pat Nguyen')).toBeVisible()
    expect(within(pair).getByText('5A')).toBeVisible()
    expect(within(pair).queryByText('No one yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /Lanes 5-6/ })).toHaveTextContent('1 of 5')
    await waitFor(() => {
      expect(server.puts).toEqual([{ registrationId: pat.registrationId, lane: 5 }])
    })
    expect(screen.queryByText(/No save is configured/)).not.toBeInTheDocument()
  })

  it('gives the next bowler on a pair the next seat (D-56)', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)
    for (const name of ['Pat Nguyen', 'Carl Dubois']) {
      await user.click(
        await screen.findByRole('button', { name: `Assign to lanes: ${name}` }, { timeout: 3000 }),
      )
      await user.click(await screen.findByRole('button', { name: /Lanes 5-6/ }))
    }

    const pair = await pairCard(/Lanes 5-6/)
    expect(
      within(pair)
        .getAllByText(/^[1-9]\d?[A-E]$/)
        .map((position) => position.textContent),
    ).toEqual(['5A', '6C'])
    expect(screen.getByRole('heading', { name: 'Unassigned (0)' })).toBeVisible()
    expect(screen.getByText('Everyone has a lane.')).toBeVisible()
  })

  it('moves a bowler from one pair to another and frees the seat (D-57)', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Move Joe Fontaine' }, { timeout: 3000 }),
    )

    await user.click(await screen.findByRole('button', { name: /Lanes 5-6/ }))

    const from = await pairCard(/Lanes 1-2/)
    expect(within(from).queryByText('Joe Fontaine')).not.toBeInTheDocument()
    expect(within(from).getByText('Dana Abbott')).toBeVisible()
    expect(screen.getByRole('heading', { level: 3, name: /Lanes 1-2/ })).toHaveTextContent('1 of 5')
    expect(within(await pairCard(/Lanes 5-6/)).getByText('Joe Fontaine')).toBeVisible()
  })

  it('offers Unassigned to a bowler who has a lane, and saves a null lane (LAN-09, D-57)', async () => {
    const page = filled()
    const server = serve(page)
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

    expect(await screen.findByRole('heading', { name: 'Unassigned (3)' })).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Unassigned bowlers' })).getByText('Joe Fontaine'),
    ).toBeVisible()
    expect(within(await pairCard(/Lanes 1-2/)).queryByText('Joe Fontaine')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(server.puts).toEqual([{ registrationId: joe.registrationId, lane: null }])
    })
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

  it('puts the bowler back and says why when the API refuses (Q-28, D-220)', async () => {
    const page = filled()
    serve(page)
    server.use(
      http.put('/v1/tournaments/:id/:kind/:sessionId/lanes/:registrationId', () =>
        HttpResponse.json(
          { message: 'Lanes 5-6 are full (5 of 5). Pick another pair.' },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )
    await user.click(await screen.findByRole('button', { name: /Lanes 5-6/ }))

    expect(await screen.findByText('Lanes 5-6 are full (5 of 5). Pick another pair.')).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'Unassigned (2)' })).toBeVisible()
    expect(within(await pairCard(/Lanes 5-6/)).queryByText('Pat Nguyen')).not.toBeInTheDocument()
  })

  it('keeps the error until it is dismissed (Q-28)', async () => {
    const page = filled()
    serve(page)
    server.use(
      http.put('/v1/tournaments/:id/:kind/:sessionId/lanes/:registrationId', () =>
        HttpResponse.json(
          { message: 'This squad is complete. Lanes cannot change.' },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )
    await user.click(await screen.findByRole('button', { name: /Lanes 5-6/ }))
    const notice = (await screen.findByText(/This squad is complete/)).closest('[role="alert"]')
    if (!(notice instanceof HTMLElement)) throw new Error('The error is not an alert')

    await user.click(within(notice).getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText(/This squad is complete/)).not.toBeInTheDocument()
  })

  it('marks the row busy while the save is out, and clears it when the API answers (D-220)', async () => {
    const page = filled()
    serve(page)
    let answer: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      answer = resolve
    })
    server.use(
      http.put('/v1/tournaments/:id/:kind/:sessionId/lanes/:registrationId', async () => {
        await gate
        return HttpResponse.json({ position: '5A' })
      }),
    )
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )
    await user.click(await screen.findByRole('button', { name: /Lanes 5-6/ }))

    const row = (await screen.findAllByText('Pat Nguyen'))[0]?.closest('li')
    expect(row).toHaveAttribute('aria-busy', 'true')
    expect(within(await pairCard(/Lanes 5-6/)).getByText('5A')).toBeVisible()

    answer()
    await waitFor(() => {
      expect(screen.getByText('Pat Nguyen').closest('li')).toHaveAttribute('aria-busy', 'false')
    })
  })

  it('shows the seat the API chose when it is not the one guessed (LAN-20, D-57)', async () => {
    const page = filled()
    const api = serve(page)
    server.use(
      http.put('/v1/tournaments/:id/:kind/:sessionId/lanes/:registrationId', () => {
        // Another desk took 5A first, so the server seats Pat on 6C.
        api.replace({
          ...api.current(),
          pairs: api
            .current()
            .pairs.map((pair) =>
              pair.firstLane === 5 ? { ...pair, bowlers: [{ ...pat, position: '6C' }] } : pair,
            ),
          unassigned: [carl],
        })
        return HttpResponse.json({ position: '6C' })
      }),
    )
    const user = userEvent.setup()
    open(page)
    await user.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )
    await user.click(await screen.findByRole('button', { name: /Lanes 5-6/ }))

    const pair = await pairCard(/Lanes 5-6/)
    await waitFor(() => {
      expect(within(pair).getByText('6C')).toBeVisible()
    })
    expect(within(pair).queryByText('5A')).not.toBeInTheDocument()
  })

  it('shows no controls to a user who may watch but not move bowlers (D-216)', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    const page = filled()
    serve(page)

    open(page)

    expect(
      await screen.findByRole('heading', { name: 'Unassigned (2)' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /Assign to lanes/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument()
    expect(screen.getByText('Pat Nguyen')).toBeVisible()
    expect(screen.queryByText(/is complete/)).not.toBeInTheDocument()
  })
})

describe('Recap sheets button (LAN-12, RPT-09)', () => {
  const recapPath = (kind: string) => `/v1/tournaments/:id/${kind}/:sessionId/recap-sheets`

  it('opens the recap sheet dialog over the lane page, which stays put (D-64)', async () => {
    const page = filled()
    serve(page)
    server.use(
      http.get(recapPath('squads'), () =>
        HttpResponse.json(
          createRecapSheets({ sheets: [createRecapSheet({ name: 'Joe Fontaine' })] }),
        ),
      ),
    )
    open(page)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Recap sheets' }, { timeout: 3000 }),
    )

    expect(await screen.findByRole('button', { name: 'Print all' })).toBeVisible()
    expect(screen.getByRole('article', { name: 'Recap sheet for Joe Fontaine' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Lanes (1 to 10)' })).toBeInTheDocument()
  })

  it('closes the dialog and leaves the lane page as it was', async () => {
    const page = filled()
    serve(page)
    server.use(http.get(recapPath('squads'), () => HttpResponse.json(createRecapSheets())))
    open(page)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Recap sheets' }, { timeout: 3000 }),
    )
    await screen.findByText(/No bowler has a lane yet/)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recap sheets' })).toBeVisible()
  })

  it('is there on a complete squad too (D-63)', async () => {
    const page = createLanePage({
      session: { ...filled().session, complete: true },
      pairs: [createLanePair(1, [joe])],
      divisions: [{ id: 'd1', number: 1, name: 'Open', entries: 1 }],
    })
    serve(page)

    open(page)

    expect(
      await screen.findByRole('button', { name: 'Recap sheets' }, { timeout: 3000 }),
    ).toBeVisible()
  })

  it('asks the sweeper route for a sweeper (D-60)', async () => {
    const page = createLanePage({
      session: { ...filled().session, kind: 'sweeper' },
      pairs: [createLanePair(1, [joe])],
      divisions: [{ id: 'd1', number: 1, name: 'Open', entries: 1 }],
    })
    serve(page)
    let asked = ''
    server.use(
      http.get(recapPath('sweepers'), ({ request }) => {
        asked = new URL(request.url).pathname
        return HttpResponse.json(createRecapSheets({ session: { ...page.session, games: 3 } }))
      }),
    )
    open(page)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Recap sheets' }, { timeout: 3000 }),
    )

    await screen.findByText(/No bowler has a lane yet/)
    expect(asked).toContain('/sweepers/')
  })

  it('offers no recap button when no one has entered (LAN-10)', async () => {
    const page = createLanePage()
    serve(page)

    open(page)

    await screen.findByText(/No bowlers have entered this squad yet/, undefined, { timeout: 3000 })
    expect(screen.queryByRole('button', { name: 'Recap sheets' })).not.toBeInTheDocument()
  })
})
