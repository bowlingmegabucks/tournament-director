import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import { createSettings, createSignedInUser } from '../../mocks/data'
import { AddRegistrationLink } from './AddRegistrationLink'

function show(session?: { kind: 'squad' | 'sweeper'; id: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AddRegistrationLink tournamentId="t 1" session={session}>
          Add registration
        </AddRegistrationLink>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function serveSettings(completed: boolean) {
  server.use(
    http.get('/v1/tournaments/:id/settings', () =>
      HttpResponse.json({ settings: createSettings({ completed }) }),
    ),
  )
}

afterEach(() => {
  setMockUser(null)
})

describe('AddRegistrationLink (REG-22, D-130, D-157, D-164)', () => {
  it('links to the add page for a director', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serveSettings(false)
    show()

    expect(await screen.findByRole('link', { name: 'Add registration' })).toHaveAttribute(
      'href',
      '/tournaments/t 1/registrations/new',
    )
  })

  it('carries a squad or sweeper to check, with its id encoded', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serveSettings(false)
    show({ kind: 'sweeper', id: 'a&b' })

    expect(await screen.findByRole('link', { name: 'Add registration' })).toHaveAttribute(
      'href',
      '/tournaments/t 1/registrations/new?sweeper=a%26b',
    )
  })

  it('shows nothing to a score keeper', async () => {
    setMockUser(createSignedInUser({ roles: ['scoreKeeper'] }))
    serveSettings(false)
    show()

    await waitFor(() => {
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
  })

  it('shows nothing on a complete tournament', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    serveSettings(true)
    show()

    await waitFor(() => {
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
  })

  it('still shows the link when the settings read fails; the page and the API refuse', async () => {
    setMockUser(createSignedInUser({ roles: ['director'] }))
    server.use(
      http.get('/v1/tournaments/:id/settings', () => new HttpResponse(null, { status: 500 })),
    )
    show()

    // The settings query retries a failure once before it gives up.
    expect(
      await screen.findByRole('link', { name: 'Add registration' }, { timeout: 4000 }),
    ).toBeVisible()
  })
})
