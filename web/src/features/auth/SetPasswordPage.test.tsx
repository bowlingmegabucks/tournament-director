import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { expiredInviteToken } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'

const good = 'a long enough password'

async function fill(password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText('New password'), password)
  await userEvent.type(screen.getByLabelText('Confirm password'), confirm)
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Set password' }))

describe('SetPasswordPage', () => {
  it('has labelled new-password fields', async () => {
    renderApp('/set-password?token=abc')

    expect(
      await screen.findByRole('heading', { name: 'Choose your password', level: 1 }),
    ).toBeVisible()
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'password')
    expect(document.title).toBe('Choose your password · Tournament Director')
  })

  it('sends the token and password in the body, then offers sign-in', async () => {
    let sent: unknown
    let url = ''
    server.use(
      http.post('/v1/auth/reset-password', async ({ request }) => {
        sent = await request.json()
        url = request.url
        return HttpResponse.json({ status: true })
      }),
    )
    renderApp('/set-password?token=abc')
    await fill(good)

    await submit()

    expect(await screen.findByText('Your password is set.')).toBeVisible()
    expect(sent).toEqual({ token: 'abc', newPassword: good })
    expect(url).not.toContain('abc')
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('catches two passwords that differ, without calling the API', async () => {
    let called = false
    server.use(
      http.post('/v1/auth/reset-password', () => {
        called = true
        return HttpResponse.json({ status: true })
      }),
    )
    renderApp('/set-password?token=abc')
    await fill(good, `${good}!`)

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('The two passwords do not match.')
    expect(called).toBe(false)
  })

  it('says an expired or used link needs a new one', async () => {
    renderApp(`/set-password?token=${expiredInviteToken}`)
    await fill(good)

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link has expired or was already used. Ask an admin for a new one.',
    )
    expect(screen.getByLabelText('New password')).toBeVisible()
  })

  it('shows "Saving…" and disables the button while it works', async () => {
    server.use(
      http.post('/v1/auth/reset-password', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ status: true })
      }),
    )
    renderApp('/set-password?token=abc')
    await fill(good)

    await submit()

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await screen.findByText('Your password is set.')
  })

  it('has nothing to submit without a token', async () => {
    renderApp('/set-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('This link is not valid.')
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })
})
