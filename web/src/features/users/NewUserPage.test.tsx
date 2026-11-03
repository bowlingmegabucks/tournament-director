import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSignedInUser } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { takenEmail } from '../../mocks/userHandlers'
import { renderApp } from '../../test/renderApp'

async function openPage() {
  setMockUser(createSignedInUser({ roles: ['admin'] }))
  renderApp('/users/new')
  await screen.findByRole('heading', { name: 'Add user', level: 1 })
  await screen.findByRole('group', { name: 'Roles' })
}

async function fill(name: string, email: string) {
  await userEvent.type(screen.getByLabelText('Name'), name)
  await userEvent.type(screen.getByLabelText('Email'), email)
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Add user' }))

describe('NewUserPage', () => {
  it('lists the API roles with labels and hints, none ticked', async () => {
    await openPage()

    for (const label of ['Score keeper', 'Tournament director', 'Admin']) {
      expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked()
    }
    expect(screen.getByRole('checkbox', { name: 'Admin' })).toHaveAccessibleDescription(
      'Everything, including adding users.',
    )
    expect(document.title).toBe('Add user · Tournament Director')
  })

  it('shows a role the web app does not know under its own name', async () => {
    server.use(
      http.get('/v1/users/options', () =>
        HttpResponse.json({ roles: ['referee'], inviteEmail: true }),
      ),
    )

    await openPage()

    expect(screen.getByRole('checkbox', { name: 'referee' })).toBeVisible()
  })

  it('will not save with no role (D-103) and clears the message when one is picked', async () => {
    await openPage()
    await fill('Bea Bowler', 'bea@example.com')

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick at least one role.')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Score keeper' }))
    expect(screen.queryByText('Pick at least one role.')).not.toBeInTheDocument()
  })

  it('sends the name, email, and roles, then confirms and empties the form', async () => {
    let sent: unknown
    server.use(
      http.post('/v1/users', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(
          { id: 'u1', email: 'bea@example.com', name: 'Bea Bowler', roles: ['director'] },
          { status: 201 },
        )
      }),
    )
    await openPage()
    await fill('  Bea Bowler ', ' bea@example.com ')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tournament director' }))

    await submit()

    expect(await screen.findByText('Invite sent to bea@example.com.')).toBeVisible()
    expect(sent).toEqual({ name: 'Bea Bowler', email: 'bea@example.com', roles: ['director'] })
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'Tournament director' })).not.toBeChecked()
  })

  it('disables the button and says "Adding…" while it saves', async () => {
    server.use(
      http.post('/v1/users', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json(
          { id: 'u1', email: 'a@b.co', name: 'A', roles: ['admin'] },
          { status: 201 },
        )
      }),
    )
    await openPage()
    await fill('A', 'a@b.co')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Admin' }))

    await submit()

    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    await screen.findByText('Invite sent to a@b.co.')
  })

  it('shows the API message for an email already in use, and keeps what was typed', async () => {
    await openPage()
    await fill('Taken Person', takenEmail)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Admin' }))

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists.',
    )
    expect(screen.getByLabelText('Email')).toHaveValue(takenEmail)
    expect(screen.getByRole('checkbox', { name: 'Admin' })).toBeChecked()
  })

  it('says email is not set up, and will not submit', async () => {
    server.use(
      http.get('/v1/users/options', () =>
        HttpResponse.json({ roles: ['admin'], inviteEmail: false }),
      ),
    )

    await openPage()

    expect(screen.getByRole('alert')).toHaveTextContent('Email is not set up on the server')
    expect(screen.getByRole('button', { name: 'Add user' })).toBeDisabled()
  })

  it('shows an error with a retry when the options fail to load', async () => {
    server.use(http.get('/v1/users/options', () => new HttpResponse(null, { status: 500 })))
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    renderApp('/users/new')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The user options could not be loaded. Try again.',
    )
    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('group', { name: 'Roles' })).toBeVisible()
  })

  it('shows Loading while it fetches the options', async () => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    renderApp('/users/new')

    expect(await screen.findByText('Loading…')).toBeVisible()
    await screen.findByRole('group', { name: 'Roles' })
  })
})

describe('the add-user route', () => {
  it('sends a signed-out visitor to sign in', async () => {
    renderApp('/users/new')

    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
  })

  it.each(['director', 'scoreKeeper'])('turns away a %s', async (role) => {
    setMockUser(createSignedInUser({ roles: [role] }))
    renderApp('/users/new')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Add user' })).not.toBeInTheDocument()
  })
})
