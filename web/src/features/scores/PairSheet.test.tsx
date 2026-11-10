import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { FakeEventSource } from '../../test/fakeEventSource'
import {
  afterGameOne,
  boxOf,
  connect,
  entryUrl,
  openEntry,
  serve,
  signInKeeper,
  viewOf,
} from './entryTestSupport'

beforeEach(() => {
  signInKeeper()
})

/** Open lanes 1-2 of game 2: Cal on 1A and Dee on 1B bowl there in game 2 (they started on 3-4). */
async function openSheet(api = serve()) {
  openEntry('/2/1')
  const cal = await boxOf('Cal Ode', 2)
  return { api, cal, dee: screen.getByRole('textbox', { name: /Dee Park, game 2$/ }) }
}

const nextButtons = () => screen.getAllByRole('button', { name: /^(Next|Done)/ })

describe('the pair sheet: what it shows (SCR-21, D-230)', () => {
  it('lists the bowlers on the lanes of the picked game, with the lane they bowl in it', async () => {
    serve()
    openEntry('/2/1')

    const rows = within(await screen.findByRole('list', { name: 'Scores for lanes 1-2, game 2' }))
    const items = rows.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // Cal and Dee started on lanes 3-4 and bowl lanes 1-2 in game 2.
    expect(items[0]).toHaveTextContent('1A')
    expect(items[0]).toHaveTextContent('Cal Ode')
    expect(items[1]).toHaveTextContent('1B')
    expect(items[1]).toHaveTextContent('Dee Park')
    expect(screen.getByRole('heading', { level: 2, name: 'Game 2 · Lanes 1-2' })).toBeVisible()
  })

  it('shows the other games as text, and the running total (D-229)', async () => {
    serve(viewOf({ ...afterGameOne, cal: [200, null, 0] }))
    openEntry('/2/1')

    const cal = (await screen.findByText('Cal Ode')).closest('li')
    expect(cal).toHaveTextContent('Game 1: 200 · Game 3: 0 · missed')
    expect(cal).toHaveTextContent('Total 200')
  })

  it('shows each box with the saved score for this game, empty when none (SCR-21)', async () => {
    serve(viewOf({ ...afterGameOne, cal: [200, 211, null] }))
    openEntry('/2/1')
    expect(await boxOf('Cal Ode', 2)).toHaveValue('211')
    expect(screen.getByRole('textbox', { name: /Dee Park, game 2$/ })).toHaveValue('')
  })

  it('asks for the number pad and nothing else (D-230)', async () => {
    const { cal } = await openSheet()
    expect(cal).toHaveAttribute('type', 'text')
    expect(cal).toHaveAttribute('inputmode', 'numeric')
    expect(cal).toHaveAttribute('pattern', '[0-9]*')
    // No maxlength: the box keeps three digits itself, so a paste of "1x2y3456" still gives "123".
    expect(cal).not.toHaveAttribute('maxlength')
    expect(cal).toHaveAttribute('autocomplete', 'off')
    expect(cal).toHaveAttribute('enterkeyhint', 'next')
  })

  it('labels the last box Done, and every other Next (D-230)', async () => {
    await openSheet()
    const buttons = nextButtons()
    expect(buttons.map((button) => button.textContent)).toEqual(['Next, Cal Ode', 'Done, Dee Park'])
    expect(screen.getByRole('textbox', { name: /Dee Park, game 2$/ })).toHaveAttribute(
      'enterkeyhint',
      'done',
    )
  })

  it('links back to the game and to the next pair, but not a previous one on the first (SCR-21)', async () => {
    serve()
    openEntry('/2/1')
    const nav = within(await screen.findByRole('navigation', { name: 'Pairs' }))
    expect(nav.getByRole('link', { name: '← Game 2' })).toHaveAttribute('href', entryUrl('/2'))
    expect(nav.getByRole('link', { name: 'Next pair 3-4 →' })).toHaveAttribute(
      'href',
      entryUrl('/2/3'),
    )
    expect(nav.queryByRole('link', { name: /← Pair/ })).not.toBeInTheDocument()
  })

  it('links to the previous pair, and not a next one on the last (SCR-21)', async () => {
    serve()
    openEntry('/2/3')
    const nav = within(await screen.findByRole('navigation', { name: 'Pairs' }))
    expect(nav.getByRole('link', { name: '← Pair 1-2' })).toHaveAttribute('href', entryUrl('/2/1'))
    expect(nav.queryByRole('link', { name: /Next pair/ })).not.toBeInTheDocument()
  })

  it('says every score is in when it is, and not before (SCR-21)', async () => {
    serve(viewOf({ ...afterGameOne, cal: [200, 211, null], dee: [190, 205, null] }))
    openEntry('/2/1')
    expect(
      await screen.findByText('✓ All 2 scores are in for game 2 on these lanes.'),
    ).toBeVisible()
  })

  it('does not say it while a score is missing (SCR-21)', async () => {
    serve()
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)
    expect(screen.queryByText(/All 2 scores are in/)).not.toBeInTheDocument()
  })

  it('says no bowlers are on lanes that hold none in this game, with a way back (SCR-21)', async () => {
    serve()
    openEntry('/2/9')
    expect(await screen.findByText('No bowlers on lanes 9-10 in game 2.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to game 2' })).toHaveAttribute(
      'href',
      entryUrl('/2'),
    )
  })
})

describe('the pair sheet: saving (SCR-15, SCR-19, D-228)', () => {
  it('saves a score when Next is pressed, says Saved, and moves to the next bowler (D-228)', async () => {
    const { api, cal, dee } = await openSheet()

    await userEvent.type(cal, '212')
    await userEvent.click(nextButtons()[0] as HTMLElement)

    await waitFor(() => {
      expect(api.puts).toEqual([
        { registrationId: 'cal', game: 2, body: { score: 212 }, method: 'PUT' },
      ])
    })
    expect(await screen.findByText('✓ Saved')).toBeVisible()
    expect(cal).toHaveValue('212')
    expect(dee).toHaveFocus()
  })

  it('saves on Enter the same way (D-230)', async () => {
    const { api, cal, dee } = await openSheet()

    await userEvent.type(cal, '190{Enter}')

    await waitFor(() => {
      expect(api.puts).toHaveLength(1)
    })
    expect(api.puts[0]).toMatchObject({ registrationId: 'cal', body: { score: 190 } })
    expect(dee).toHaveFocus()
  })

  it('saves when the keeper leaves the box, and Next then does not save it twice (D-228)', async () => {
    const { api, cal } = await openSheet()
    await userEvent.type(cal, '201')

    // Pressing Next leaves the box first, which saves it; Next then joins that save.
    await userEvent.click(nextButtons()[0] as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText('✓ Saved')).toBeVisible()
    })
    expect(api.puts).toHaveLength(1)
  })

  it('sends focus to the Next pair link after the last bowler (D-230)', async () => {
    const { api, dee } = await openSheet()

    await userEvent.type(dee, '188')
    await userEvent.click(nextButtons()[1] as HTMLElement)

    await waitFor(() => {
      expect(api.puts).toHaveLength(1)
    })
    expect(await screen.findByRole('link', { name: 'Next pair 3-4 →' })).toHaveFocus()
  })

  it('takes only digits typed or pasted, three at most (SCR-01, D-230)', async () => {
    const { cal, dee } = await openSheet()

    await userEvent.type(cal, '2a1-x2')
    expect(cal).toHaveValue('212')

    await userEvent.click(dee)
    await userEvent.paste('1x2y3456')
    expect(dee).toHaveValue('123')
  })

  it.each(['0', '00'])('refuses %s with the message, and sends nothing (SCR-01)', async (text) => {
    const { api, cal } = await openSheet()

    await userEvent.type(cal, text)
    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(await screen.findByText('Enter a score from 1 to 300.')).toBeVisible()
    expect(cal).toHaveAttribute('aria-invalid', 'true')
    expect(api.puts).toEqual([])
  })

  it('refuses 301 and clears the message once the keeper types again (SCR-01)', async () => {
    const { api, cal } = await openSheet()
    await userEvent.type(cal, '301')
    await userEvent.click(nextButtons()[0] as HTMLElement)
    expect(await screen.findByText('Enter a score from 1 to 300.')).toBeVisible()

    await userEvent.clear(cal)
    await userEvent.type(cal, '300')

    expect(screen.queryByText('Enter a score from 1 to 300.')).not.toBeInTheDocument()
    expect(cal).not.toHaveAttribute('aria-invalid')
    expect(api.puts).toEqual([])
  })

  it('does not move on from a box it could not save (SCR-01)', async () => {
    const { cal, dee } = await openSheet()
    await userEvent.type(cal, '0')

    await userEvent.click(nextButtons()[0] as HTMLElement)

    await screen.findByText('Enter a score from 1 to 300.')
    expect(dee).not.toHaveFocus()
  })

  it('sends nothing for a box the keeper typed back to what was saved (D-228)', async () => {
    const api = serve(viewOf({ ...afterGameOne, cal: [200, 211, null] }))
    openEntry('/2/1')
    const cal = await boxOf('Cal Ode', 2)

    await userEvent.type(cal, '{Backspace}1')
    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(cal).toHaveValue('211')
    expect(api.puts).toEqual([])
    expect(screen.queryByText('✓ Saved')).not.toBeInTheDocument()
  })

  it('clears a saved score when the box is emptied (SCR-06, D-228)', async () => {
    const api = serve(viewOf({ ...afterGameOne, cal: [200, 211, null] }))
    openEntry('/2/1')
    const cal = await boxOf('Cal Ode', 2)

    await userEvent.clear(cal)
    await userEvent.click(nextButtons()[0] as HTMLElement)

    await waitFor(() => {
      expect(api.puts).toEqual([
        { registrationId: 'cal', game: 2, body: undefined, method: 'DELETE' },
      ])
    })
    expect(await screen.findByText('Cleared')).toBeVisible()
    expect(cal).toHaveValue('')
  })

  it('does nothing when an empty box was already empty (D-228)', async () => {
    const { api, cal } = await openSheet()

    await userEvent.click(cal)
    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(api.puts).toEqual([])
  })

  it('says the API message when a clear is refused, and keeps the typed box (D-229)', async () => {
    serve(viewOf({ ...afterGameOne, cal: [200, 211, 190] }))
    server.use(
      http.delete('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game', () =>
        HttpResponse.json({ message: 'Clear game 3 first.' }, { status: 409 }),
      ),
    )
    openEntry('/2/1')
    const cal = await boxOf('Cal Ode', 2)

    await userEvent.clear(cal)
    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(await screen.findByText('Clear game 3 first.')).toBeVisible()
    expect(cal).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('the pair sheet: a late bowler and missed games (SCR-03, D-229)', () => {
  it('says before saving that earlier empty games will be saved as 0', async () => {
    serve(viewOf({}))
    openEntry('/3/1')
    await screen.findByRole('textbox', { name: /Ann Lee, game 3$/ })

    expect(
      screen.getAllByText('No scores for games 1 and 2. Saving game 3 saves them as 0 (missed).'),
    ).toHaveLength(2)
  })

  it('names just the games that are empty, and says nothing for game 1 (D-229)', async () => {
    serve(
      viewOf({
        ann: [180, null, null],
        bea: [null, null, null],
        cal: [null, null, null],
        dee: [null, null, null],
      }),
    )
    openEntry('/3/1')
    await screen.findByRole('textbox', { name: /Ann Lee, game 3$/ })
    expect(screen.getAllByText(/No scores for game 2\. Saving game 3/)).toHaveLength(1)

    openEntry('/1/1')
    await screen.findByRole('textbox', { name: /Ann Lee, game 1$/ })
    expect(screen.queryByText(/Saving game 1 saves them/)).not.toBeInTheDocument()
  })

  it('shows the filled games as 0 missed once the score is saved (D-229)', async () => {
    serve(viewOf({}))
    openEntry('/3/1')
    const ann = await screen.findByRole('textbox', { name: /Ann Lee, game 3$/ })

    await userEvent.type(ann, '167{Enter}')

    const row = (await screen.findByText('Ann Lee')).closest('li')
    await waitFor(() => {
      expect(row).toHaveTextContent('Game 1: 0 · missed · Game 2: 0 · missed')
    })
    expect(row).toHaveTextContent('Total 167')
    expect(row).not.toHaveTextContent('Saving game 3 saves them')
  })

  it('does not warn on a read only sheet (D-231)', async () => {
    serve(viewOf({}, { complete: true }))
    openEntry('/3/1')
    await screen.findByRole('textbox', { name: /Ann Lee, game 3$/ })
    expect(screen.queryByText(/saves them as 0/)).not.toBeInTheDocument()
  })
})

describe('the pair sheet: when saving fails (SCR-15, D-228)', () => {
  it('keeps what was typed, says why, and offers Try again (SCR-15)', async () => {
    const { cal } = await openSheet()
    let failing = true
    server.use(
      http.put('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game', () =>
        failing
          ? HttpResponse.json(
              { message: 'This squad is complete. Scores cannot change.' },
              { status: 409 },
            )
          : HttpResponse.json({ scores: [200, 190, null], total: 390 }),
      ),
    )

    await userEvent.type(cal, '190')
    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(await screen.findByText('This squad is complete. Scores cannot change.')).toBeVisible()
    expect(cal).toHaveValue('190')
    expect(cal).toHaveAttribute('aria-invalid', 'true')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('✓ Saved')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('says the connection failed when the request never answers (SCR-15)', async () => {
    const { cal } = await openSheet()
    server.use(
      http.put('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/:game', () =>
        HttpResponse.error(),
      ),
    )

    await userEvent.type(cal, '190')
    await userEvent.click(nextButtons()[0] as HTMLElement)

    expect(await screen.findByText('Could not save. Check the connection.')).toBeVisible()
  })
})

describe('the pair sheet: live updates (SCR-20, D-231)', () => {
  it('shows a score another keeper saved, in a box nobody is typing in (D-232)', async () => {
    const api = serve()
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)
    connect()

    api.replace(viewOf({ ...afterGameOne, dee: [190, 205, null] }))
    act(() => {
      FakeEventSource.latest().message('{"kind":"scores","version":1}')
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /Dee Park, game 2$/ })).toHaveValue('205')
    })
  })

  it('never replaces what the keeper is typing with the saved score (D-231)', async () => {
    const api = serve()
    openEntry('/2/1')
    const cal = await boxOf('Cal Ode', 2)
    connect()
    await userEvent.type(cal, '17')

    api.replace(viewOf({ ...afterGameOne, cal: [200, 250, null], dee: [190, 205, null] }))
    act(() => {
      FakeEventSource.latest().message('{"kind":"scores","version":1}')
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /Dee Park, game 2$/ })).toHaveValue('205')
    })
    expect(cal).toHaveValue('17')
  })

  it('turns read only when the squad is completed by someone else (D-231)', async () => {
    const api = serve()
    openEntry('/2/1')
    await boxOf('Cal Ode', 2)
    connect()

    api.replace(viewOf(afterGameOne, { complete: true }))
    act(() => {
      FakeEventSource.latest().message('{"kind":"lanes","version":2}')
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /Cal Ode, game 2$/ })).toHaveAttribute('readonly')
    })
    expect(screen.queryByRole('button', { name: /^Next/ })).not.toBeInTheDocument()
  })
})
