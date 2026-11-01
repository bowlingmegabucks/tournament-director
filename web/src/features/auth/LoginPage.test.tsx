import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSignedInUser } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'
import { LoginPage } from './LoginPage'

function renderLogin(entry: string | { pathname: string; state: unknown } = '/login') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Home page</p>} />
          <Route path="/secret" element={<p>Secret page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fill(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

describe('LoginPage', () => {
  it('has labelled fields with the right autocomplete', async () => {
    renderLogin()

    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(document.title).toBe('Sign in · Tournament Director')
  })

  it('signs in and goes Home', async () => {
    renderLogin()
    await fill('director@example.com', 'directorP4sswordLocal')

    await submit()

    expect(await screen.findByText('Home page')).toBeVisible()
  })

  it('returns to the page the user came from, with its query and hash', async () => {
    renderLogin({
      pathname: '/login',
      state: { from: { pathname: '/secret', search: '?a=1', hash: '#top' } },
    })
    await fill('director@example.com', 'directorP4sswordLocal')

    await submit()

    expect(await screen.findByText('Secret page')).toBeVisible()
  })

  it.each([
    ['an address on another site', { from: { pathname: 'https://evil.example/x' } }],
    ['a state without from', {}],
    ['a from without a path', { from: {} }],
  ])('goes Home when the state holds %s', async (_label, state) => {
    renderLogin({ pathname: '/login', state })
    await fill('director@example.com', 'directorP4sswordLocal')

    await submit()

    expect(await screen.findByText('Home page')).toBeVisible()
  })

  it('shows one error line for a wrong password and keeps the form', async () => {
    renderLogin()
    await fill('director@example.com', 'wrong')

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong.')
    expect(screen.getByLabelText('Email')).toHaveValue('director@example.com')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Email or password is wrong.',
    )
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Email or password is wrong.',
    )
  })

  it('has no description on the fields before an error', () => {
    renderLogin()

    expect(screen.getByLabelText('Email')).not.toHaveAccessibleDescription()
  })

  it('tells how long to wait after too many attempts', async () => {
    server.use(
      http.post('/v1/auth/sign-in/email', () =>
        HttpResponse.json({ message: 'x' }, { status: 429, headers: { 'Retry-After': '900' } }),
      ),
    )
    renderLogin()
    await fill('a@b.com', 'x')

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 15 minutes')
  })

  it('says the service is down on a 503', async () => {
    server.use(
      http.post('/v1/auth/sign-in/email', () =>
        HttpResponse.json({ message: 'x' }, { status: 503 }),
      ),
    )
    renderLogin()
    await fill('a@b.com', 'x')

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in is not working right now. Try again.',
    )
  })

  it('shows the error when /v1/me fails after a good sign-in', async () => {
    server.use(http.get('/v1/me', () => new HttpResponse(null, { status: 500 })))
    renderLogin()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in could not be checked. Try again.',
    )
  })

  it.each(['//evil.example', '/\\evil.example'])('ignores the return path %s', async (pathname) => {
    setMockUser(createSignedInUser())
    renderLogin({ pathname: '/login', state: { from: { pathname } } })

    expect(await screen.findByText('Home page')).toBeVisible()
  })

  it('disables the button and says "Signing in…" while it runs', async () => {
    renderLogin()
    await fill('director@example.com', 'directorP4sswordLocal')

    await submit()

    const button = screen.getByRole('button', { name: 'Signing in…' })
    expect(button).toBeDisabled()
    await screen.findByText('Home page')
  })

  it('sends a user who is already signed in away from /login', async () => {
    setMockUser(createSignedInUser())
    renderLogin()

    expect(await screen.findByText('Home page')).toBeVisible()
  })

  it('offers three quick-login buttons in development (D-104)', async () => {
    renderLogin()

    const names = ['Log in as admin', 'Log in as tournament director', 'Log in as score keeper']
    for (const name of names) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
  })

  it.each([
    ['Log in as admin', 'Local Admin'],
    ['Log in as tournament director', 'Local Director'],
    ['Log in as score keeper', 'Local Score Keeper'],
  ])('"%s" signs in as that user', async (button, name) => {
    renderApp('/login')

    await userEvent.click(await screen.findByRole('button', { name: button }))

    expect(
      await within(screen.getByRole('navigation', { name: 'Main' })).findByText(name),
    ).toBeVisible()
  })

  it('disables the quick-login buttons while signing in', async () => {
    renderLogin()

    await userEvent.click(screen.getByRole('button', { name: 'Log in as admin' }))

    expect(screen.getByRole('button', { name: 'Log in as score keeper' })).toBeDisabled()
    await screen.findByText('Home page')
  })
})
