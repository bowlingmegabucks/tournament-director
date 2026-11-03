import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/renderApp'

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Send link' }))

describe('ForgotPasswordPage', () => {
  it('is one click from the sign-in page', async () => {
    renderApp('/login')

    await userEvent.click(await screen.findByRole('link', { name: 'Forgot your password?' }))

    expect(await screen.findByRole('heading', { name: 'Forgot password', level: 1 })).toBeVisible()
    expect(document.title).toBe('Forgot password · Tournament Director')
  })

  it('sends the trimmed email and gives the same answer for any address', async () => {
    let sent: unknown
    server.use(
      http.post('/v1/auth/request-password-reset', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ status: true })
      }),
    )
    renderApp('/forgot-password')
    await userEvent.type(await screen.findByLabelText('Email'), ' bea@example.com ')

    await submit()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'If that address has an account, we sent it a link to choose a new password.',
    )
    expect(sent).toEqual({ email: 'bea@example.com' })
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('shows "Sending…" and disables the button while it works', async () => {
    server.use(
      http.post('/v1/auth/request-password-reset', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ status: true })
      }),
    )
    renderApp('/forgot-password')
    await userEvent.type(await screen.findByLabelText('Email'), 'bea@example.com')

    await submit()

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    await screen.findByRole('status')
  })

  it.each([
    [429, 'Too many attempts. Try again later.'],
    [503, 'Password reset is not available right now. Ask an admin.'],
    [400, 'Enter a valid email address.'],
    [500, 'Could not send the link. Try again.'],
  ])('shows the failure for a %i and keeps the form', async (status, message) => {
    server.use(
      http.post('/v1/auth/request-password-reset', () => HttpResponse.json({}, { status })),
    )
    renderApp('/forgot-password')
    await userEvent.type(await screen.findByLabelText('Email'), 'bea@example.com')

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByLabelText('Email')).toHaveValue('bea@example.com')
  })

  it('says so when the server cannot be reached', async () => {
    server.use(http.post('/v1/auth/request-password-reset', () => HttpResponse.error()))
    renderApp('/forgot-password')
    await userEvent.type(await screen.findByLabelText('Email'), 'bea@example.com')

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the server. Try again.',
    )
  })
})
