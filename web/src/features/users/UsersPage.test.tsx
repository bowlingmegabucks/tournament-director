import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSignedInUser } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'

async function openPage() {
  setMockUser(createSignedInUser({ roles: ['admin'] }))
  renderApp('/users')
  await screen.findByRole('table', { name: 'Users' })
}

describe('UsersPage', () => {
  it('lists each user with email and role names, marking a disabled one', async () => {
    await openPage()

    const dee = screen.getByRole('row', { name: /Local Director/ })
    expect(within(dee).getByText('director@example.com')).toBeVisible()
    expect(within(dee).getByText('Tournament director, Score keeper')).toBeVisible()
    expect(
      within(screen.getByRole('row', { name: /Old Timer/ })).getByText('(disabled)'),
    ).toBeVisible()
    expect(within(screen.getByRole('row', { name: /Old Timer/ })).getByText('None')).toBeVisible()
    expect(document.title).toBe('Users · Tournament Director')
  })

  it('links to the add-user page', async () => {
    await openPage()

    await userEvent.click(screen.getByRole('link', { name: 'Add user' }))

    expect(await screen.findByRole('heading', { name: 'Add user', level: 1 })).toBeVisible()
  })

  it('sends a reset link for one user and says where it went', async () => {
    let called = ''
    server.use(
      http.post('/v1/users/:id/password-reset', ({ params }) => {
        called = String(params['id'])
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await openPage()

    await userEvent.click(screen.getByRole('button', { name: 'Send reset link to Local Director' }))

    expect(await screen.findByText('Reset link sent to director@example.com.')).toBeVisible()
    expect(called).toBe('u-dee')
  })

  it('disables the buttons and says "Sending…" on the chosen row while it works', async () => {
    server.use(
      http.post('/v1/users/:id/password-reset', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await openPage()

    await userEvent.click(screen.getByRole('button', { name: 'Send reset link to Local Admin' }))

    expect(screen.getByRole('button', { name: 'Sending reset link to Local Admin' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send reset link to Old Timer' })).toBeDisabled()
    await screen.findByText('Reset link sent to admin@example.com.')
  })

  it('shows the mail failure and keeps it until dismissed', async () => {
    server.use(
      http.post('/v1/users/:id/password-reset', () =>
        HttpResponse.json(
          { message: 'The reset email could not be sent. Check the mail settings and try again.' },
          { status: 502 },
        ),
      ),
    )
    await openPage()

    await userEvent.click(screen.getByRole('button', { name: 'Send reset link to Old Timer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The reset email could not be sent. Check the mail settings and try again.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    server.use(http.get('/v1/users', () => HttpResponse.json({ users: [] })))
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    renderApp('/users')

    expect(await screen.findByText('No users yet.')).toBeVisible()
  })

  it('shows an error with a retry when the list fails to load', async () => {
    server.use(http.get('/v1/users', () => new HttpResponse(null, { status: 500 })))
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    renderApp('/users')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The users could not be loaded. Try again.',
    )
    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Users' })).toBeVisible()
  })

  it('shows Loading while it fetches', async () => {
    setMockUser(createSignedInUser({ roles: ['admin'] }))
    renderApp('/users')

    expect(await screen.findByText('Loading users…')).toBeVisible()
    await screen.findByRole('table', { name: 'Users' })
  })

  it('turns away a signed-out visitor and a director', async () => {
    renderApp('/users')
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
  })

  it('shows a director no access', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    renderApp('/users')

    expect(await screen.findByRole('heading', { name: 'No access' })).toBeVisible()
  })
})
