import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { focusManager } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import { createLanePage, createLanePair, createSignedInUser } from '../../mocks/data'
import { dana, filled, joe, open, serve } from './lanesTestSupport'

const box = (name: string) =>
  screen.findByRole('checkbox', { name: `${name} in play` }, { timeout: 3000 })
const dialogName = 'Take lanes 1-2 out of play?'
/** What coming back to the window does: the page reads again. */
function refocus() {
  focusManager.setFocused(false)
  focusManager.setFocused(true)
}

beforeEach(() => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
  focusManager.setFocused(undefined)
})

describe('LanesPage pairs out of play', () => {
  it('takes an empty pair out at once, counts fewer spots, and brings it back (OOP-03, OOP-05, OOP-09)', async () => {
    const page = filled()
    const api = serve(page)
    open(page)
    expect(await screen.findByText(/of 25 spots open/, {}, { timeout: 3000 })).toBeVisible()

    await userEvent.click(await box('Lanes 5-6'))

    expect(await screen.findByText(/of 20 spots open/)).toBeVisible()
    expect(await box('Lanes 5-6')).not.toBeChecked()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await waitFor(async () => {
      expect(await box('Lanes 5-6')).not.toHaveAttribute('aria-disabled')
    })
    await userEvent.click(await box('Lanes 5-6'))

    expect(await screen.findByText(/of 25 spots open/)).toBeVisible()
    expect(api.pairPuts).toEqual([
      { lane: 5, inPlay: false },
      { lane: 5, inPlay: true },
    ])
  })

  it('names who will be unassigned and sends nothing until the director agrees (OOP-04)', async () => {
    const page = filled()
    const api = serve(page)
    open(page)

    await userEvent.click(await box('Lanes 1-2'))

    const dialog = screen.getByRole('dialog', { name: dialogName })
    expect(
      within(dialog).getByText(`${joe.name} and ${dana.name} will move to unassigned.`),
    ).toBeVisible()
    expect(api.pairPuts).toEqual([])

    await userEvent.click(within(dialog).getByRole('button', { name: 'Take out of play' }))

    expect(await screen.findByRole('heading', { name: 'Unassigned (4)' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const seen = [joe.registrationId, dana.registrationId]
    expect(api.pairPuts).toEqual([{ lane: 1, inPlay: false, confirmWarnings: true, seen }])
  })

  it('leaves the pair alone when the director goes back (OOP-04)', async () => {
    const page = filled()
    const api = serve(page)
    open(page)
    await userEvent.click(await box('Lanes 1-2'))

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await box('Lanes 1-2')).toBeChecked()
    expect(api.pairPuts).toEqual([])
  })

  it('asks when the API finds a bowler the page did not show (OOP-04)', async () => {
    const page = filled()
    serve(page)
    server.use(
      http.put('/v1/tournaments/:id/squads/:sessionId/lanes/pairs/:lane', () =>
        HttpResponse.json(
          { message: 'x', warnings: [{ field: 'inPlay', message: 'x' }] },
          { status: 409 },
        ),
      ),
    )
    open(page)

    await userEvent.click(await box('Lanes 5-6'))

    const dialog = await screen.findByRole('dialog', { name: 'Take lanes 5-6 out of play?' })
    expect(within(dialog).getByText('Anyone on this pair will move to unassigned.')).toBeVisible()
  })

  it('puts the bowlers back and says why a confirmed change did not save', async () => {
    const page = filled()
    serve(page)
    server.use(
      http.put('/v1/tournaments/:id/squads/:sessionId/lanes/pairs/:lane', () =>
        HttpResponse.json({ message: 'This squad is complete.' }, { status: 409 }),
      ),
    )
    open(page)
    await userEvent.click(await box('Lanes 1-2'))

    await userEvent.click(screen.getByRole('button', { name: 'Take out of play' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This squad is complete.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unassigned (2)' })).toBeVisible()
    expect(await box('Lanes 1-2')).toBeChecked()
  })

  it('does not call your own change an update from someone else', async () => {
    const page = filled()
    serve(page)
    open(page)

    await userEvent.click(await box('Lanes 5-6'))

    expect(await screen.findByText(/of 20 spots open/)).toBeVisible()
    expect(screen.queryByText(/^Updated:/)).not.toBeInTheDocument()
  })

  it('says why an empty pair did not save', async () => {
    const page = filled()
    serve(page)
    server.use(
      http.put('/v1/tournaments/:id/squads/:sessionId/lanes/pairs/:lane', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    open(page)

    await userEvent.click(await box('Lanes 5-6'))

    expect(await screen.findByText('Could not save the lanes. Try again.')).toBeVisible()
    expect(await box('Lanes 5-6')).toBeChecked()
  })

  it('shows the pairs on a session nobody has entered, so a lane can go out (OOP-03)', async () => {
    const page = createLanePage()
    const api = serve(page)
    open(page)

    await userEvent.click(await box('Lanes 5-6'))

    expect(screen.getByText('No bowlers have entered this squad yet.')).toBeVisible()
    expect(await screen.findByText(/of 20 spots open/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Recap sheets' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check-in sheet' })).not.toBeInTheDocument()
    expect(api.pairPuts).toEqual([{ lane: 5, inPlay: false }])
  })

  it('drops the question when the squad completes while it is open (OOP-06)', async () => {
    const page = filled()
    const api = serve(page)
    open(page)
    await userEvent.click(await box('Lanes 1-2'))
    expect(screen.getByRole('dialog', { name: dialogName })).toBeVisible()

    api.replace({ ...page, session: { ...page.session, complete: true } })
    refocus()

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    api.replace(page)
    refocus()
    expect(await box('Lanes 1-2')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers a pair out of play as unavailable in the Assign dialog (OOP-02)', async () => {
    const page = createLanePage({
      pairs: [{ ...createLanePair(1), outOfPlay: true }, createLanePair(3)],
      unassigned: filled().unassigned,
    })
    serve(page)
    open(page)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Assign to lanes: Pat Nguyen' }, { timeout: 3000 }),
    )

    expect(screen.getByRole('button', { name: /Lanes 1-2.*Out of play/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Lanes 3-4/ })).toBeEnabled()
  })

  it.each([
    ['a score keeper', 'scoreKeeper' as const, false],
    ['a complete squad', 'director' as const, true],
  ])('has no checkboxes for %s (OOP-06)', async (_name, role, complete) => {
    setMockUser(createSignedInUser({ roles: [role] }))
    const base = filled()
    const page = { ...base, session: { ...base.session, complete } }
    serve(page)
    open(page)

    expect(
      await screen.findByRole('heading', { level: 3, name: /Lanes 1-2/ }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: /in play/ })).not.toBeInTheDocument()
  })
})
