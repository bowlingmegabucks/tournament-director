import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { applyDnf } from './entryLogic'
import { boxOf, openEntry, serve, signInKeeper, viewOf } from './entryTestSupport'

beforeEach(() => {
  signInKeeper()
})

/** Record the "did not finish" calls and answer as the API does. */
function serveDnf(options: { status?: number; message?: string } = {}) {
  const calls: { method: string; registrationId: string }[] = []
  const respond = (method: string, registrationId: string) => {
    calls.push({ method, registrationId })
    return options.status && options.status !== 204
      ? HttpResponse.json({ message: options.message ?? 'Refused' }, { status: options.status })
      : new HttpResponse(null, { status: 204 })
  }
  server.use(
    http.put('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/dnf', ({ params }) =>
      respond('PUT', String(params['registrationId'])),
    ),
    http.delete('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/dnf', ({ params }) =>
      respond('DELETE', String(params['registrationId'])),
    ),
  )
  return calls
}

/** Game 2 on lanes 1-2: Cal (1A) has a score from game 1; Dee (1B) has none. */
const caleOnly = () => viewOf({ cal: [200, null, null] })

describe('the pair sheet: did not finish (SCR-24, D-248, D-249)', () => {
  it('offers the button to a bowler with a score and not to one without', async () => {
    serve(caleOnly())
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)

    expect(screen.getByRole('button', { name: 'Did not finish, Cal Ode' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /Did not finish, Dee Park/ }),
    ).not.toBeInTheDocument()
  })

  it('flags the bowler, shows the state with Undo, and takes the button away', async () => {
    const user = userEvent.setup()
    serve(caleOnly())
    const calls = serveDnf()
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)

    await user.click(screen.getByRole('button', { name: 'Did not finish, Cal Ode' }))

    expect(await screen.findByText('Did not finish')).toBeVisible()
    expect(calls).toEqual([{ method: 'PUT', registrationId: 'cal' }])
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Did not finish, Cal Ode' }),
    ).not.toBeInTheDocument()
  })

  it('undoes the flag and brings the button back', async () => {
    const user = userEvent.setup()
    serve(applyDnf(caleOnly(), 'cal', true))
    const calls = serveDnf()
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)
    expect(screen.getByText('Did not finish')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Undo, did not finish for Cal Ode' }))

    expect(await screen.findByRole('button', { name: 'Did not finish, Cal Ode' })).toBeVisible()
    expect(calls).toEqual([{ method: 'DELETE', registrationId: 'cal' }])
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument()
  })

  it('shows what the API refused, with no Try again, and leaves the box alone', async () => {
    const user = userEvent.setup()
    serve(caleOnly())
    serveDnf({
      status: 409,
      message: 'This bowler has no score yet, so there is nothing to finish.',
    })
    openEntry('/2/1')
    const box = await boxOf('Cal Ode', 2)

    await user.click(screen.getByRole('button', { name: 'Did not finish, Cal Ode' }))

    expect(await screen.findByText(/has no score yet/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument()
    expect(box).not.toHaveAttribute('aria-invalid')
    // The button stays, so the keeper can try once more.
    expect(screen.getByRole('button', { name: 'Did not finish, Cal Ode' })).toBeVisible()
  })

  it('says so when the connection is lost', async () => {
    const user = userEvent.setup()
    serve(caleOnly())
    server.use(
      http.put('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/dnf', () =>
        HttpResponse.error(),
      ),
    )
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)

    await user.click(screen.getByRole('button', { name: 'Did not finish, Cal Ode' }))

    expect(await screen.findByText('Could not save. Check the connection.')).toBeVisible()
  })

  it('takes the flag off when a score is saved for the bowler (SCR-25, D-250)', async () => {
    const user = userEvent.setup()
    serve(applyDnf(caleOnly(), 'cal', true))
    openEntry('/2/1')
    const box = await boxOf('Cal Ode', 2)
    expect(screen.getByText('Did not finish')).toBeVisible()

    await user.type(box, '210')
    await user.click(screen.getByRole('button', { name: /^Next, Cal Ode/ }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Did not finish, Cal Ode' })).toBeVisible()
  })

  it('keeps the flag when a score is cleared (SCR-25)', async () => {
    const user = userEvent.setup()
    serve(applyDnf(viewOf({ cal: [200, 210, null] }), 'cal', true))
    openEntry('/2/1')
    const box = await boxOf('Cal Ode', 2)

    await user.clear(box)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('Cleared')).toBeVisible()
    })
    expect(screen.getByText('Did not finish')).toBeVisible()
  })

  it('offers no button on a complete session (D-10, D-231)', async () => {
    serve(viewOf({ cal: [200, 210, 220] }, { complete: true }))
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)

    expect(screen.queryByRole('button', { name: /Did not finish/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument()
  })

  it('names the bowler in the button for a screen reader', async () => {
    serve(caleOnly())
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)
    const rows = within(screen.getByRole('list', { name: 'Scores for lanes 1-2, game 2' }))
    const first = rows.getAllByRole('listitem')[0]
    expect(first).toHaveTextContent('Cal Ode')
    expect(
      within(first as HTMLElement).getByRole('button', { name: 'Did not finish, Cal Ode' }),
    ).toBeVisible()
  })
})
