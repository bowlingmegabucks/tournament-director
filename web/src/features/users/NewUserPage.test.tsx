import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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

const clickSubmit = () => userEvent.click(screen.getByRole('button', { name: 'Add user' }))

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

    await clickSubmit()

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

    await clickSubmit()

    expect(await screen.findByText('Invite sent to bea@example.com.')).toBeVisible()
    expect(sent).toEqual({ name: 'Bea Bowler', email: 'bea@example.com', roles: ['director'] })
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'Tournament director' })).not.toBeChecked()
  })

  it('asks for a role again for the next user, after one was added', async () => {
    await openPage()
    await fill('Bea Bowler', 'bea@example.com')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tournament director' }))
    await clickSubmit()
    await screen.findByText('Invite sent to bea@example.com.')

    await fill('Cy Caller', 'cy@example.com')
    await clickSubmit()

    expect(await screen.findByText('Pick at least one role.')).toBeVisible()
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

    await clickSubmit()

    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    await screen.findByText('Invite sent to a@b.co.')
  })

  it('shows the API message for an email already in use, and keeps what was typed', async () => {
    await openPage()
    await fill('Taken Person', takenEmail)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Admin' }))

    await clickSubmit()

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

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    })
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

describe('NewUserPage details', () => {
  it('drops a role when its box is unticked', async () => {
    let sent: unknown
    server.use(
      http.post('/v1/users', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(
          { id: 'u1', email: 'bea@example.com', name: 'Bea', roles: ['scoreKeeper'] },
          { status: 201 },
        )
      }),
    )
    await openPage()
    await fill('Bea', 'bea@example.com')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tournament director' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Score keeper' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tournament director' }))
    expect(screen.getByRole('checkbox', { name: 'Tournament director' })).not.toBeChecked()

    await clickSubmit()

    await screen.findByText('Invite sent to bea@example.com.')
    expect(sent).toMatchObject({ roles: ['scoreKeeper'] })
  })

  it('links the roles group to the missing-role message', async () => {
    await openPage()
    await fill('Bea', 'bea@example.com')

    await clickSubmit()

    expect(await screen.findByRole('group', { name: 'Roles' })).toHaveAccessibleDescription(
      'Pick at least one role.',
    )
  })

  it('closes the confirmation when it is dismissed', async () => {
    await openPage()
    await fill('Bea', 'bea@example.com')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Score keeper' }))
    await clickSubmit()
    await screen.findByText('Invite sent to bea@example.com.')

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Invite sent to bea@example.com.')).not.toBeInTheDocument()
  })

  it('does not show Loading once the options arrive', async () => {
    await openPage()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('stops the browser submitting the form itself', async () => {
    await openPage()

    const notStopped = fireEvent.submit(screen.getByRole('button', { name: 'Add user' }))

    expect(notStopped).toBe(false)
  })
})

describe('NewUserPage leaving with changes', () => {
  const home = () => screen.getByRole('link', { name: 'Home' })

  it('asks before leaving once a box or role is filled, and lets an empty form go', async () => {
    await openPage()
    await userEvent.type(screen.getByLabelText('Name'), 'Dee')

    await userEvent.click(home())

    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Admin' }))
    await userEvent.click(home())
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Leave page' }))

    expect(await screen.findByRole('heading', { name: 'Tournament Management' })).toBeVisible()
  })

  it('asks for an email alone, and not at all once the invite is sent', async () => {
    await openPage()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(home())
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    await userEvent.clear(screen.getByLabelText('Email'))

    await fill('Dee New', 'dee.new@example.com')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Admin' }))
    await clickSubmit()
    await screen.findByText(/Invite sent to/)
    await userEvent.click(home())

    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })
})
