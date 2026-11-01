import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSignedInUser } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'

const mainMenu = () => screen.getByRole('navigation', { name: 'Main' })

describe('AuthMenu (top bar)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('shows Sign in to a signed-out visitor, and the link goes to /login', async () => {
    server.use(http.get('/v1/tournaments', () => HttpResponse.json({ tournaments: [] })))
    renderApp('/tournaments')

    const link = await within(mainMenu()).findByRole('link', { name: 'Sign in' })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('says it is checking while /v1/me loads', async () => {
    renderApp('/nowhere')

    expect(within(mainMenu()).getByText('Loading…')).toBeVisible()
    await within(mainMenu()).findByRole('link', { name: 'Sign in' })
  })

  it('shows the name and Sign out to a signed-in user, and Sign out returns to Sign in', async () => {
    setMockUser(createSignedInUser({ name: 'Dana Director' }))
    renderApp('/nowhere')

    expect(await within(mainMenu()).findByText('Dana Director')).toBeVisible()
    expect(within(mainMenu()).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()

    await userEvent.click(within(mainMenu()).getByRole('button', { name: 'Sign out' }))

    expect(await within(mainMenu()).findByRole('link', { name: 'Sign in' })).toBeVisible()
    expect(within(mainMenu()).queryByText('Dana Director')).not.toBeInTheDocument()
  })

  it('shows an error with a retry, not Sign in, when the check fails', async () => {
    server.use(http.get('/v1/me', () => new HttpResponse(null, { status: 503 })))
    renderApp('/nowhere')

    expect(await within(mainMenu()).findByRole('alert')).toHaveTextContent(
      'Sign-in could not be checked. Try again.',
    )
    expect(within(mainMenu()).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()

    server.use(http.get('/v1/me', () => HttpResponse.json({ apiKey: false, user: null })))
    await userEvent.click(within(mainMenu()).getByRole('button', { name: 'Try again' }))

    expect(await within(mainMenu()).findByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  it('shows an error and stays signed in when sign-out fails', async () => {
    setMockUser(createSignedInUser({ name: 'Dana Director' }))
    server.use(http.post('/v1/auth/sign-out', () => new HttpResponse(null, { status: 500 })))
    renderApp('/nowhere')

    await userEvent.click(await within(mainMenu()).findByRole('button', { name: 'Sign out' }))

    expect(await within(mainMenu()).findByRole('alert')).toHaveTextContent('Could not sign out')
    expect(within(mainMenu()).getByText('Dana Director')).toBeVisible()
  })

  it('shows nothing, and asks nothing, when sign-in is off (production before 0.4.0)', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_SHOW_SIGN_IN', '')
    let asked = false
    server.use(
      http.get('/v1/me', () => {
        asked = true
        return HttpResponse.json({ user: null })
      }),
    )
    renderApp('/nowhere')

    expect(within(mainMenu()).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(asked).toBe(false)
  })

  it('has no /login page when sign-in is off', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_SHOW_SIGN_IN', '')
    renderApp('/login')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })
})

describe('AuthMenu sign-out and cached data', () => {
  it('refetches the page data after sign-out, so nothing seen while signed in stays cached', async () => {
    setMockUser(createSignedInUser({ name: 'Dana Director' }))
    let requests = 0
    server.use(
      http.get('/v1/tournaments', () => {
        requests += 1
        return HttpResponse.json({ tournaments: [] })
      }),
    )
    renderApp('/tournaments')
    await screen.findByText('No tournaments yet.')
    expect(requests).toBe(1)

    await userEvent.click(await within(mainMenu()).findByRole('button', { name: 'Sign out' }))

    await within(mainMenu()).findByRole('link', { name: 'Sign in' })
    await vi.waitFor(() => {
      expect(requests).toBe(2)
    })
  })
})
