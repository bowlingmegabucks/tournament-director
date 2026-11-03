import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSignedInUser } from '../../mocks/data'
import { setMockUser, wrongCurrentPassword } from '../../mocks/authHandlers'
import { renderApp } from '../../test/renderApp'

const good = 'a long enough password'

async function fillPasswords(current: string, next: string, confirm = next) {
  await userEvent.type(await screen.findByLabelText('Current password'), current)
  await userEvent.type(screen.getByLabelText('New password'), next)
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm)
}

const submitPassword = () =>
  userEvent.click(screen.getByRole('button', { name: 'Change password' }))

describe('AccountPage', () => {
  afterEach(() => {
    setMockUser(null)
  })

  it('sends a signed-out visitor to sign in', async () => {
    renderApp('/account')

    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
  })

  it('opens for a user with no permission at all', async () => {
    setMockUser(createSignedInUser({ roles: [], permissions: [] }))
    renderApp('/account')

    expect(await screen.findByRole('heading', { name: 'My account', level: 1 })).toBeVisible()
    expect(document.title).toBe('My account · Tournament Director')
  })

  it('is reached from the name in the top bar', async () => {
    setMockUser(createSignedInUser({ name: 'Dana Director' }))
    renderApp('/nowhere')

    await userEvent.click(
      await within(screen.getByRole('navigation', { name: 'Main' })).findByRole('link', {
        name: 'Dana Director',
      }),
    )

    expect(await screen.findByRole('heading', { name: 'My account', level: 1 })).toBeVisible()
  })

  describe('profile', () => {
    it('shows the name and email, and saves a new name', async () => {
      let sent: unknown
      server.use(
        http.patch('/v1/account', async ({ request }) => {
          sent = await request.json()
          return HttpResponse.json({ name: 'Dee D' })
        }),
      )
      setMockUser(createSignedInUser({ name: 'Dana Director', email: 'dana@example.com' }))
      renderApp('/account')
      const field = await screen.findByLabelText('Name')
      expect(field).toHaveValue('Dana Director')
      expect(screen.getByText(/dana@example.com/)).toBeVisible()

      await userEvent.clear(field)
      await userEvent.type(field, '  Dee D ')
      await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

      expect(await screen.findByText('Name saved as Dee D.')).toBeVisible()
      expect(sent).toEqual({ name: 'Dee D' })
    })

    it('shows the new name in the top bar', async () => {
      setMockUser(createSignedInUser({ name: 'Dana Director' }))
      renderApp('/account')
      const field = await screen.findByLabelText('Name')

      await userEvent.clear(field)
      await userEvent.type(field, 'Dee D')
      await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

      expect(
        await within(screen.getByRole('navigation', { name: 'Main' })).findByRole('link', {
          name: 'Dee D',
        }),
      ).toBeVisible()
    })

    it('keeps an error toast until dismissed', async () => {
      server.use(http.patch('/v1/account', () => new HttpResponse(null, { status: 500 })))
      setMockUser(createSignedInUser())
      renderApp('/account')
      await screen.findByLabelText('Name')

      await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('The name could not be saved. Try again.')
      await userEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows the saved, trimmed name after a save, not what was typed', async () => {
      server.use(
        http.patch('/v1/account', () => {
          setMockUser(createSignedInUser({ name: 'Dee D' }))
          return HttpResponse.json({ name: 'Dee D' })
        }),
      )
      setMockUser(createSignedInUser({ name: 'Dana Director' }))
      renderApp('/account')
      const field = await screen.findByLabelText('Name')

      await userEvent.clear(field)
      await userEvent.type(field, '  Dee D  ')
      await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

      await screen.findByText('Name saved as Dee D.')
      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toHaveValue('Dee D')
      })
    })

    it('handles the submit itself, so the page does not reload', async () => {
      setMockUser(createSignedInUser())
      renderApp('/account')
      const form = (await screen.findByLabelText('Name')).closest('form')
      if (!form) throw new Error('no form')

      // `fireEvent` returns false when a handler called `preventDefault`.
      expect(fireEvent.submit(form)).toBe(false)
    })

    it('says Saving… while the request runs', async () => {
      server.use(
        http.patch('/v1/account', async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return HttpResponse.json({ name: 'Dana Director' })
        }),
      )
      setMockUser(createSignedInUser())
      renderApp('/account')
      await screen.findByLabelText('Name')

      await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    })
  })

  describe('toasts', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('closes a success toast by itself after eight seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      setMockUser(createSignedInUser())
      renderApp('/account')
      await screen.findByLabelText('Name')
      await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
      expect(await screen.findByText(/^Name saved as/)).toBeVisible()

      act(() => {
        vi.advanceTimersByTime(7_900)
      })
      expect(screen.getByText(/^Name saved as/)).toBeVisible()
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(screen.queryByText(/^Name saved as/)).not.toBeInTheDocument()
    })

    it('keeps an error toast on screen', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      server.use(http.patch('/v1/account', () => new HttpResponse(null, { status: 500 })))
      setMockUser(createSignedInUser())
      renderApp('/account')
      await screen.findByLabelText('Name')
      await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
      await screen.findByRole('alert')

      act(() => {
        vi.advanceTimersByTime(60_000)
      })

      expect(screen.getByRole('alert')).toBeVisible()
    })
  })

  describe('change password', () => {
    it('has labelled password fields', async () => {
      setMockUser(createSignedInUser())
      renderApp('/account')

      expect(await screen.findByLabelText('Current password')).toHaveAttribute(
        'autocomplete',
        'current-password',
      )
      expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
      expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'password')
    })

    it('sends both passwords in the body, clears the form, and says the other sessions end', async () => {
      let sent: unknown
      server.use(
        http.post('/v1/account/password', async ({ request }) => {
          sent = await request.json()
          return new HttpResponse(null, { status: 204 })
        }),
      )
      setMockUser(createSignedInUser())
      renderApp('/account')
      await fillPasswords('my old password', good)

      await submitPassword()

      expect(
        await screen.findByText('Password changed. Your other sessions are signed out.'),
      ).toBeVisible()
      expect(sent).toEqual({ currentPassword: 'my old password', newPassword: good })
      expect(screen.getByLabelText('Current password')).toHaveValue('')
      expect(screen.getByLabelText('New password')).toHaveValue('')
      expect(screen.getByLabelText('Confirm new password')).toHaveValue('')
    })

    it('catches two new passwords that differ, without calling the API', async () => {
      let called = false
      server.use(
        http.post('/v1/account/password', () => {
          called = true
          return new HttpResponse(null, { status: 204 })
        }),
      )
      setMockUser(createSignedInUser())
      renderApp('/account')
      await fillPasswords('my old password', good, 'another long password')

      await submitPassword()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The two new passwords do not match.',
      )
      for (const label of ['Current password', 'New password', 'Confirm new password']) {
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
          'The two new passwords do not match.',
        )
      }
      expect(called).toBe(false)
    })

    it('clears the mismatch message when the new password is edited', async () => {
      setMockUser(createSignedInUser())
      renderApp('/account')
      await fillPasswords('my old password', good, 'another long password')
      await submitPassword()
      await screen.findByRole('alert')

      await userEvent.type(screen.getByLabelText('New password'), 'x')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('handles the submit itself, so the page does not reload', async () => {
      setMockUser(createSignedInUser())
      renderApp('/account')
      const form = (await screen.findByLabelText('Current password')).closest('form')
      if (!form) throw new Error('no form')

      expect(fireEvent.submit(form)).toBe(false)
    })

    it('clears the mismatch message when a new password is edited', async () => {
      setMockUser(createSignedInUser())
      renderApp('/account')
      await fillPasswords('my old password', good, 'another long password')
      await submitPassword()
      await screen.findByRole('alert')

      await userEvent.type(screen.getByLabelText('Confirm new password'), 'x')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows the API reason when the current password is wrong, and keeps what was typed', async () => {
      setMockUser(createSignedInUser())
      renderApp('/account')
      await fillPasswords(wrongCurrentPassword, good)

      await submitPassword()

      expect(await screen.findByRole('alert')).toHaveTextContent('The current password is wrong.')
      expect(screen.getByLabelText('Current password')).toHaveValue(wrongCurrentPassword)
    })

    it('says how long to wait when throttled', async () => {
      server.use(
        http.post(
          '/v1/account/password',
          () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '600' } }),
        ),
      )
      setMockUser(createSignedInUser())
      renderApp('/account')
      await fillPasswords('my old password', good)

      await submitPassword()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Too many attempts. Wait 10 minutes and try again.',
      )
    })

    it('says Changing… and disables the button while the request runs', async () => {
      server.use(
        http.post('/v1/account/password', async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return new HttpResponse(null, { status: 204 })
        }),
      )
      setMockUser(createSignedInUser())
      renderApp('/account')
      await fillPasswords('my old password', good)

      await submitPassword()

      expect(await screen.findByRole('button', { name: 'Changing…' })).toBeDisabled()
    })
  })
})
