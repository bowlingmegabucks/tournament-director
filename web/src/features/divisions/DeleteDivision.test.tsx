import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
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
})
