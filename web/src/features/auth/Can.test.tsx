import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createSignedInUser } from '../../mocks/data'
import { setMockUser } from '../../mocks/authHandlers'
import { renderWithClient } from '../../test/renderWithClient'
import { Can } from './Can'

const ui = (
  <>
    <Can permission="tournaments.write">
      <button type="button">Create tournament</button>
    </Can>
    <p>Page</p>
  </>
)

describe('Can', () => {
  it('shows its children to a user who holds the permission (D-102)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    renderWithClient(ui)

    expect(await screen.findByRole('button', { name: 'Create tournament' })).toBeVisible()
  })

  it('hides its children from a user without the permission', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    renderWithClient(ui)

    await screen.findByText('Page')
    // Let the sign-in check finish first, or the absence proves nothing.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: 'Create tournament' })).not.toBeInTheDocument()
  })

  it('hides its children from a signed-out visitor', async () => {
    renderWithClient(ui)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides its children while the check runs, and when it fails', async () => {
    server.use(http.get('/v1/me', () => new HttpResponse(null, { status: 503 })))
    renderWithClient(ui)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
