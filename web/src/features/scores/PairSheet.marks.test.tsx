import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { afterGameOne, boxOf, openEntry, serve, signInKeeper, viewOf } from './entryTestSupport'

const putPath = '/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game'

beforeEach(() => {
  signInKeeper()
})

/** Lanes 1-2 of game 2: Cal on 1A and Dee on 1B. */
async function openSheet(view = viewOf(afterGameOne)) {
  const api = serve(view)
  openEntry('/2/1')
  const cal = await boxOf('Cal Ode', 2)
  const dee = screen.getByRole('textbox', { name: /Dee Park, game 2$/ })
  return { api, cal, dee }
}

const nextButtons = () => screen.getAllByRole('button', { name: /^(Next|Done)/ })
const problemOf = (id: string) => document.getElementById(`${id}-problem`)

function refuseSaves(message = 'This squad is complete. Scores cannot change.') {
  server.use(http.put(putPath, () => HttpResponse.json({ message }, { status: 409 })))
}

describe('the pair sheet: marks and drafts (SCR-15, D-228, D-231)', () => {
  it('shows no message under a box until something happens to it', async () => {
    await openSheet()
    expect(problemOf('cal')).toBeEmptyDOMElement()
    expect(problemOf('dee')).toBeEmptyDOMElement()
  })

  it('says Saving… while the save is on its way', async () => {
    const { cal } = await openSheet()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.put(putPath, async () => {
        await gate
        return HttpResponse.json({ scores: [200, 201, null], total: 401 })
      }),
    )

    await userEvent.type(cal, '201')
    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(await screen.findByText('Saving…')).toBeVisible()
    release()
    expect(await screen.findByText('✓ Saved')).toBeVisible()
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument()
  })

  it('keeps one bowler’s typing and message when another bowler saves', async () => {
    const { cal, dee } = await openSheet()
    await userEvent.type(cal, '301')
    await userEvent.type(dee, '150')
    expect(await screen.findByText('Enter a score from 1 to 300.')).toBeVisible()

    await userEvent.click(nextButtons()[1] as HTMLElement)

    await waitFor(() => {
      expect(problemOf('dee')).toHaveTextContent('✓ Saved')
    })
    expect(cal).toHaveValue('301')
    expect(problemOf('cal')).toHaveTextContent('Enter a score from 1 to 300.')
  })

  it('points the box at its message while it is wrong', async () => {
    const { cal } = await openSheet()
    await userEvent.type(cal, '301')
    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(cal).toHaveAttribute('aria-invalid', 'true')
    expect(cal).toHaveAccessibleDescription('Enter a score from 1 to 300.')
  })

  it('does not move on from a box whose save failed', async () => {
    const { cal, dee } = await openSheet()
    refuseSaves()
    await userEvent.type(cal, '190')

    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(await screen.findByText('This squad is complete. Scores cannot change.')).toBeVisible()
    expect(dee).not.toHaveFocus()
    expect(cal).toHaveValue('190')
  })

  it('clears the failure message once the keeper types again', async () => {
    const { cal } = await openSheet()
    refuseSaves()
    await userEvent.type(cal, '190')
    await userEvent.click(nextButtons()[0] as HTMLElement)
    expect(await screen.findByText('This squad is complete. Scores cannot change.')).toBeVisible()

    await userEvent.type(cal, '1')

    expect(
      screen.queryByText('This squad is complete. Scores cannot change.'),
    ).not.toBeInTheDocument()
    expect(cal).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('keeps a message that is not about this box when the keeper types in it', async () => {
    const { cal, dee } = await openSheet()
    await userEvent.type(cal, '301')
    await userEvent.type(dee, '1')
    expect(await screen.findByText('Enter a score from 1 to 300.')).toBeVisible()

    await userEvent.type(dee, '2')

    expect(problemOf('cal')).toHaveTextContent('Enter a score from 1 to 300.')
  })

  it('saves when the keeper leaves the box, with no press of Next', async () => {
    const { api, cal } = await openSheet()
    await userEvent.type(cal, '201')

    await userEvent.tab()

    await waitFor(() => {
      expect(api.puts).toEqual([
        { registrationId: 'cal', game: 2, body: { score: 201 }, method: 'PUT' },
      ])
    })
    expect(await screen.findByText('✓ Saved')).toBeVisible()
  })

  it('holds Enter back from the page, and lets other keys through', async () => {
    const { cal } = await openSheet()

    expect(fireEvent.keyDown(cal, { key: 'Enter' })).toBe(false)
    expect(fireEvent.keyDown(cal, { key: 'a' })).toBe(true)
  })

  it('does not say every score is in while one is missing', async () => {
    await openSheet(viewOf({ ...afterGameOne, cal: [200, 211, null] }))
    expect(screen.queryByText(/scores are in for game 2/)).not.toBeInTheDocument()
  })

  it('does not warn about earlier games for a bowler who has a score in this one', async () => {
    await openSheet(viewOf({ ...afterGameOne, cal: [null, 211, null] }))
    expect(screen.queryByText(/No scores for game/)).not.toBeInTheDocument()
  })
})
