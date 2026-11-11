import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createLaneBowler,
  createLanePage,
  createLanePair,
  createSignedInUser,
} from '../../mocks/data'
import { FakeEventSource } from '../../test/fakeEventSource'
import { filled, joe, open, serve, tournament } from './lanesTestSupport'

beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
})

/**
 * The page's status line. The drag library keeps its own hidden live region with the same role, so
 * ask for the one that says something.
 */
const statusLine = () => {
  const line = screen.getAllByRole('status').find((element) => element.textContent?.trim())
  if (!line) throw new Error('No status line')
  return line
}

const findHeading = (name: string) => screen.findByRole('heading', { name }, { timeout: 3000 })

describe('LanesPage live updates (LAN-21, D-217, D-218)', () => {
  it('says it is reconnecting until the stream connects, then that it is live', async () => {
    const page = filled()
    serve(page)
    open(page)
    await findHeading('Unassigned (2)')

    expect(statusLine()).toHaveTextContent('Reconnecting…')
    act(() => {
      FakeEventSource.latest().open()
    })

    expect(statusLine()).toHaveTextContent('Live: changes by others show here as they happen.')
    expect(FakeEventSource.latest().url).toBe(
      `/v1/tournaments/${tournament.id}/squads/${page.session.id}/events`,
    )
  })

  it("shows another desk's move when the stream says something changed, and says where", async () => {
    const page = filled()
    const api = serve(page)
    open(page)
    await findHeading('Unassigned (2)')
    act(() => {
      FakeEventSource.latest().open()
    })
    const waiting = api.current().unassigned[0]
    if (!waiting) throw new Error('No waiting bowler')
    api.replace({
      ...api.current(),
      unassigned: api.current().unassigned.slice(1),
      pairs: api
        .current()
        .pairs.map((pair) =>
          pair.firstLane === 5 ? { ...pair, bowlers: [{ ...waiting, position: '5A' }] } : pair,
        ),
    })

    act(() => {
      FakeEventSource.latest().message()
    })

    expect(await findHeading('Unassigned (1)')).toBeVisible()
    const pair = (await screen.findByRole('heading', { level: 3, name: /Lanes 5-6/ })).closest('li')
    expect(pair).not.toBeNull()
    expect(within(pair as HTMLElement).getByText(waiting.name)).toBeVisible()
    await waitFor(() => {
      expect(statusLine()).toHaveTextContent('Updated: lanes 5-6, unassigned list')
    })
  })

  it('shows a bowler who registered since the page opened, in the unassigned list (LAN-22, D-219)', async () => {
    const page = filled()
    const api = serve(page)
    open(page)
    await findHeading('Unassigned (2)')
    api.replace({
      ...api.current(),
      unassigned: [...api.current().unassigned, createLaneBowler({ name: 'Walk In' })],
    })

    act(() => {
      FakeEventSource.latest().message('{"kind":"entries","version":2}')
    })

    expect(await findHeading('Unassigned (3)')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Unassigned bowlers' })).getByText('Walk In'),
    ).toBeVisible()
  })

  it('catches up after a dropped connection (D-218)', async () => {
    const page = filled()
    const api = serve(page)
    open(page)
    await findHeading('Unassigned (2)')
    act(() => {
      FakeEventSource.latest().open()
    })
    act(() => {
      FakeEventSource.latest().fail()
    })
    expect(statusLine()).toHaveTextContent('Reconnecting…')
    api.replace({
      ...api.current(),
      unassigned: [...api.current().unassigned, createLaneBowler({ name: 'Missed One' })],
    })

    act(() => {
      FakeEventSource.latest().open()
    })

    expect(await findHeading('Unassigned (3)')).toBeVisible()
    expect(statusLine()).toHaveTextContent('Live')
  })

  it('says live updates are off when the browser gives up, and keeps working (D-217)', async () => {
    const page = filled()
    serve(page)
    open(page)
    await findHeading('Unassigned (2)')

    act(() => {
      FakeEventSource.latest().fail(true)
    })

    expect(statusLine()).toHaveTextContent(
      'Live updates are off. Reload the page to see changes by others.',
    )
    expect(await screen.findByRole('button', { name: 'Move Joe Fontaine' })).toBeVisible()
  })

  it('opens no stream and shows no status for a complete session (D-10, D-217)', async () => {
    const page = createLanePage({
      session: { ...filled().session, complete: true },
      pairs: [createLanePair(1, [joe])],
      divisions: [{ id: 'd1', number: 1, name: 'Open', entries: 1 }],
    })
    serve(page)

    open(page)

    expect(
      await screen.findByText(/This squad is complete/, undefined, { timeout: 3000 }),
    ).toBeVisible()
    expect(FakeEventSource.instances).toHaveLength(0)
    // The status line says "Live: ..."; the sidebar's "Live results" link is not it (RES-54).
    expect(screen.queryByText(/^Live:/)).not.toBeInTheDocument()
  })

  it('opens the sweeper stream for a sweeper (LAN-21)', async () => {
    const base = filled()
    const page = { ...base, session: { ...base.session, kind: 'sweeper' as const } }
    serve(page)

    open(page)
    await findHeading('Unassigned (2)')

    expect(FakeEventSource.latest().url).toBe(
      `/v1/tournaments/${tournament.id}/sweepers/${page.session.id}/events`,
    )
  })

  it('lets a score keeper watch: the stream opens, but there are no controls (D-216, D-217)', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    const page = filled()
    serve(page)

    open(page)
    await findHeading('Unassigned (2)')

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(statusLine()).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
  })

  it('does not say "Updated" for the desk’s own save (LAN-21, D-220)', async () => {
    const page = filled()
    serve(page)
    const user = userEvent.setup()
    open(page)
    await findHeading('Unassigned (2)')
    act(() => {
      FakeEventSource.latest().open()
    })
    await user.click(await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }))
    await user.click(await screen.findByRole('button', { name: /Lanes 5-6/ }))
    await findHeading('Unassigned (1)')

    // The API tells every screen, the writer's too.
    act(() => {
      FakeEventSource.latest().message()
    })

    await waitFor(() => {
      expect(statusLine()).toHaveTextContent('Live: changes by others')
    })
  })
})
