import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import {
  createDivision,
  createSettings,
  createSignedInUser,
  createTournament,
} from '../../mocks/data'
import { renderApp } from '../../test/renderApp'
import type { Division } from './types'

const tournament = createTournament({ name: 'Spring Open' })
const id = tournament.id
const open = () => renderApp(`/tournaments/${id}/divisions`)

/** A list the delete can change: the DELETE handler removes the row, so the refetch shows it gone. */
function serve(
  divisions: Division[],
  options: {
    completed?: boolean
    info?: () => Response
    remove?: (divisionId: string) => Response | Promise<Response> | undefined
  } = {},
) {
  const requests: string[] = []
  server.use(
    http.get(`/v1/tournaments/${id}`, () => HttpResponse.json({ tournament })),
    http.get(`/v1/tournaments/${id}/settings`, () =>
      HttpResponse.json({ settings: createSettings({ completed: options.completed === true }) }),
    ),
    http.get(`/v1/tournaments/${id}/divisions`, () => HttpResponse.json({ divisions })),
    http.get(
      `/v1/tournaments/${id}/divisions/:divisionId/delete-info`,
      options.info ??
        (() => HttpResponse.json({ deleteInfo: { registrationCount: 0, sweeperCount: 0 } })),
    ),
    http.delete(`/v1/tournaments/${id}/divisions/:divisionId`, async ({ params }) => {
      const divisionId = String(params['divisionId'])
      requests.push(divisionId)
      const answer = await options.remove?.(divisionId)
      if (answer) return answer
      const at = divisions.findIndex((division) => division.id === divisionId)
      const gone = divisions[at]
      divisions.splice(at, 1)
      for (const division of divisions)
        if (division.number > (gone?.number ?? 0)) division.number -= 1
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return requests
}

const trio = () => [
  createDivision({ number: 1, name: 'Open' }),
  createDivision({ number: 2, name: 'Women' }),
  createDivision({ number: 3, name: 'Senior' }),
]

async function openDialog(user: ReturnType<typeof userEvent.setup>, name = 'Women') {
  await user.click(await screen.findByRole('button', { name: `Delete ${name}` }))
  return screen.findByRole('dialog', { name: 'Delete this division?' })
}

describe('where Delete sits (D-215)', () => {
  it('puts Delete in a cell of its own, apart from the Edit link', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(trio())

    open()

    const remove = await screen.findByRole('button', { name: 'Delete Women' })
    const edit = screen.getByRole('link', { name: 'Edit Women' })
    expect(remove.closest('td')).not.toBe(edit.closest('td'))
    expect(remove.closest('tr')).toBe(edit.closest('tr'))
  })
})

describe('who sees Delete (DIV-12, D-19, D-150, D-154)', () => {
  it.each(['director', 'admin'] as const)(
    'gives a %s a Delete button per row, named for it',
    async (role) => {
      setMockUser(createSignedInUser({ roles: [role] }))
      serve(trio())

      open()

      expect(await screen.findByRole('button', { name: 'Delete Open' })).toBeVisible()
      expect(screen.getByRole('button', { name: 'Delete Women' })).toBeVisible()
      expect(screen.getByRole('button', { name: 'Delete Senior' })).toBeVisible()
    },
  )

  it('hides it for a complete tournament', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(trio(), { completed: true })

    open()

    await screen.findByRole('rowheader', { name: 'Open' })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    })
  })

  it('hides it from a score keeper and from a signed-out visitor', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    serve(trio())
    const first = open()
    await screen.findByRole('rowheader', { name: 'Open' })
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    first.unmount()

    setMockUser(null)
    open()
    await screen.findByRole('rowheader', { name: 'Open' })
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
  })
})

describe('deleting a division (DIV-12, DIV-01, D-151 to D-155)', () => {
  it('asks first, and Cancel sends nothing', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const requests = serve(trio())
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    expect(within(dialog).getByText('Women')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requests).toEqual([])
    expect(screen.getByRole('rowheader', { name: 'Women' })).toBeVisible()
  })

  it('says how many sweepers lose pins, once the counts load (D-152, D-154)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(trio(), {
      info: () => HttpResponse.json({ deleteInfo: { registrationCount: 0, sweeperCount: 2 } }),
    })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)

    expect(await within(dialog).findByText(/2 sweepers lose their bonus pins/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Delete division' })).toBeEnabled()
  })

  it('shows the refusal and only Close when bowlers are registered (D-151, D-154)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const requests = serve(trio(), {
      info: () => HttpResponse.json({ deleteInfo: { registrationCount: 12, sweeperCount: 0 } }),
    })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)

    expect(await within(dialog).findByText(/12 bowlers are registered in/)).toBeVisible()
    expect(
      within(dialog).queryByRole('button', { name: /Delete division/ }),
    ).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('still deletes when the counts cannot be read (D-154)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const requests = serve(trio(), { info: () => new HttpResponse(null, { status: 503 }) })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    expect(await within(dialog).findByText(/Any sweeper bonus pins for it go too/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Delete division' }))

    await waitFor(() => {
      expect(requests).toHaveLength(1)
    })
  })

  it('deletes the division, closes the dialog, closes the gap, and says "Division deleted" (DIV-01, D-153)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const divisions = trio()
    const womenId = divisions[1]?.id
    const requests = serve(divisions)
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete division' }))

    expect(await screen.findByText('Division deleted')).toBeVisible()
    expect(requests).toEqual([womenId])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('rowheader', { name: 'Women' })).not.toBeInTheDocument()
    })
    const senior = (await screen.findByRole('rowheader', { name: 'Senior' })).closest('tr')
    expect(within(senior as HTMLElement).getAllByRole('cell')[0]).toHaveTextContent('2')
  })

  it('shows Deleting… while the request runs', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    serve(trio(), {
      remove: async () => {
        await held
        return new HttpResponse(null, { status: 204 })
      },
    })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete division' }))

    expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    release()
    expect(await screen.findByText('Division deleted')).toBeVisible()
  })

  it('shows a refusal in an error toast that stays until dismissed, and keeps the division (D-151, D-154)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    const complete = 'This tournament is complete and cannot be changed'
    const bowlers = '1 bowler is registered in this division. Move them to another division first.'
    serve(trio(), {
      remove: () =>
        HttpResponse.json(
          { message: complete, errors: { tournament: complete, division: bowlers } },
          { status: 409 },
        ),
    })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete division' }))

    const toast = await screen.findByRole('alert')
    expect(
      within(toast)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([complete, bowlers])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Women' })).toBeVisible()
    expect(screen.queryByText('Division deleted')).not.toBeInTheDocument()
    await user.click(within(toast).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears an old refusal when the button is pressed again', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(trio(), {
      remove: () =>
        HttpResponse.json({ message: 'No', errors: { division: 'No' } }, { status: 409 }),
    })
    const user = userEvent.setup()
    open()
    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete division' }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Delete Women' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the dialog open and says why when the request fails another way', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(trio(), { remove: () => new HttpResponse(null, { status: 500 }) })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete division' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Failed to delete the division (500)',
    )
    expect(screen.getByRole('dialog', { name: 'Delete this division?' })).toBeVisible()
  })

  it('does not show the toast on an ordinary visit', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(trio())

    open()

    await screen.findByRole('rowheader', { name: 'Women' })
    expect(screen.queryByText('Division deleted')).not.toBeInTheDocument()
  })

  it('closes the dialog after a delete even while the row is still listed', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    // A 204 that leaves the list alone: only the button itself can close the dialog.
    serve(trio(), { remove: () => new HttpResponse(null, { status: 204 }) })
    const user = userEvent.setup()
    open()

    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete division' }))

    await screen.findByText('Division deleted')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('forgets an old failure when the dialog closes', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serve(trio(), { remove: () => new HttpResponse(null, { status: 500 }) })
    const user = userEvent.setup()
    open()
    const first = await openDialog(user)
    await user.click(await within(first).findByRole('button', { name: 'Delete division' }))
    await within(first).findByRole('alert')
    await user.click(within(first).getByRole('button', { name: 'Cancel' }))

    const second = await openDialog(user)

    await within(second).findByRole('button', { name: 'Delete division' })
    expect(within(second).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears a failure when the director tries again', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    serve(trio(), {
      remove: async () => {
        calls += 1
        if (calls === 1) return new HttpResponse(null, { status: 500 })
        await held
        return new HttpResponse(null, { status: 204 })
      },
    })
    const user = userEvent.setup()
    open()
    const dialog = await openDialog(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Delete division' }))
    await within(dialog).findByRole('alert')

    await user.click(within(dialog).getByRole('button', { name: 'Delete division' }))

    await within(dialog).findByRole('button', { name: 'Deleting…' })
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    release()
    await screen.findByText('Division deleted')
  })

  it('ignores a reply that lands after the dialog was closed', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    serve(trio(), {
      remove: async () => {
        await held
        return HttpResponse.json({ message: 'No', errors: { division: 'No' } }, { status: 409 })
      },
    })
    const user = userEvent.setup()
    open()
    const first = await openDialog(user)
    await user.click(await within(first).findByRole('button', { name: 'Delete division' }))
    await within(first).findByRole('button', { name: 'Deleting…' })
    // Escape closes a native dialog; the Cancel button is off while the request runs.
    act(() => {
      ;(first as HTMLDialogElement).close()
    })
    const second = await openDialog(user)

    release()
    await within(second).findByRole('button', { name: 'Delete division' })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
