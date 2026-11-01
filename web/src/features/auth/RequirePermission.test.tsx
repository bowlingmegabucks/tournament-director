import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { http, HttpResponse } from 'msw'
import { field } from '../../shared/field'
import { server } from '../../mocks/server'
import { createSignedInUser } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { RequirePermission } from './RequirePermission'

function Login() {
  const location = useLocation()
  const pathname = field(field(location.state, 'from'), 'pathname')
  return <p>Login page, from {String(pathname)}</p>
}

function renderGuarded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/secret"
            element={
              <RequirePermission permission="tournaments.write">
                <p>Secret page</p>
              </RequirePermission>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RequirePermission', () => {
  it('shows the page to a user who holds the permission', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    renderGuarded()

    expect(await screen.findByText('Secret page')).toBeVisible()
  })

  it('sends a signed-out visitor to /login and remembers the page (D-102)', async () => {
    renderGuarded()

    expect(await screen.findByText('Login page, from /secret')).toBeVisible()
    expect(screen.queryByText('Secret page')).not.toBeInTheDocument()
  })

  it('tells a signed-in user without the permission, with no redirect', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    renderGuarded()

    expect(await screen.findByText('You do not have permission to view this page.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'No access', level: 1 })).toBeVisible()
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument()
  })

  it('shows Loading while the check runs', async () => {
    renderGuarded()

    expect(screen.getByRole('status')).toHaveTextContent('Checking sign-in…')
    await screen.findByText(/Login page/)
  })

  it('shows an error with a retry, not the signed-out view, when the check fails', async () => {
    server.use(http.get('/v1/me', () => new HttpResponse(null, { status: 503 })))
    renderGuarded()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in could not be checked')
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument()

    setMockUser(createSignedInUser({ roles: ['admin'] }))
    server.use(
      http.get('/v1/me', () =>
        HttpResponse.json({ user: createSignedInUser({ roles: ['admin'] }) }),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Secret page')).toBeVisible()
  })
})
