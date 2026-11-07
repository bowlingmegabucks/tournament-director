import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { renderWithClient } from '../../test/renderWithClient'
import { BowlerSearch } from './BowlerSearch'
import type { BowlerSearch as Found, BowlerSearchResult } from './types'

function result(overrides: Partial<BowlerSearchResult> = {}): BowlerSearchResult {
  return {
    id: crypto.randomUUID(),
    name: 'Maria Gonzalez',
    firstName: 'Maria',
    lastName: 'Gonzalez',
    usbcId: '1234-56789',
    city: 'Worcester',
    state: 'MA',
    registered: null,
    ...overrides,
  }
}

function serve(found: Found | (() => Response | Promise<Response>)) {
  const queries: string[] = []
  server.use(
    http.get('/v1/bowlers', ({ request }) => {
      queries.push(new URL(request.url).search)
      return typeof found === 'function' ? found() : HttpResponse.json(found)
    }),
  )
  return queries
}

function open() {
  const onPick = vi.fn()
  const onNew = vi.fn()
  renderWithClient(<BowlerSearch tournamentId="t1" onPick={onPick} onNew={onNew} />)
  return { onPick, onNew, user: userEvent.setup() }
}

const searchFor = async (user: ReturnType<typeof userEvent.setup>, last = 'Gon') => {
  await user.type(screen.getByLabelText('Last name starts with'), last)
  await user.click(screen.getByRole('button', { name: 'Search' }))
}

describe('BowlerSearch (BWL-14, D-157, D-159, D-161)', () => {
  it('labels the four boxes, and the email box takes an email', () => {
    open()

    expect(screen.getByLabelText('Last name starts with')).toBeVisible()
    expect(screen.getByLabelText('First name starts with')).toBeVisible()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('USBC ID')).toBeVisible()
  })

  it('asks for a field when none is filled, and never searches', async () => {
    const queries = serve({ bowlers: [], more: false })
    const { user } = open()

    await user.click(screen.getByRole('button', { name: 'Search' }))
    await user.type(screen.getByLabelText('First name starts with'), '   ')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least one search field.')
    expect(queries).toHaveLength(0)
  })

  it('takes the message away once a field is filled and searched', async () => {
    serve({ bowlers: [result()], more: false })
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByRole('alert')).toBeVisible()

    await searchFor(user)

    await screen.findByRole('heading', { name: '1 bowler found' })
    expect(screen.queryByText('Enter at least one search field.')).not.toBeInTheDocument()
  })

  it('shows Searching while the request runs', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    serve(async () => {
      await gate
      return HttpResponse.json({ bowlers: [], more: false })
    })
    const { user } = open()

    await searchFor(user)

    expect(await screen.findByRole('status')).toHaveTextContent('Searching…')
    release()
    expect(await screen.findByText(/No bowler matches/)).toBeVisible()
  })

  it('says nothing about results before a search', () => {
    open()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/No bowler matches/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument()
  })

  it('says no bowler matches, with the words that point to New bowler', async () => {
    serve({ bowlers: [], more: false })
    const { user } = open()

    await searchFor(user)

    expect(await screen.findByText(/No bowler matches/)).toHaveTextContent(
      'No bowler matches. Check the spelling, search by USBC ID or email, or choose New bowler.',
    )
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument()
  })

  it('counts one bowler, and many', async () => {
    serve({ bowlers: [result(), result({ name: 'Maria Gonzales' })], more: false })
    const { user } = open()

    await searchFor(user)

    expect(await screen.findByRole('heading', { name: '2 bowlers found' })).toBeVisible()
  })

  it('shows the USBC ID and the town, and "No USBC ID" for a bowler with none', async () => {
    serve({
      bowlers: [
        result(),
        result({ id: 'b2', name: 'Maria Gonzales', usbcId: '', city: 'Quincy', state: '' }),
      ],
      more: false,
    })
    const { user } = open()

    await searchFor(user)

    expect(await screen.findByText('1234-56789 · Worcester, MA')).toBeVisible()
    expect(screen.getByText('No USBC ID · Quincy')).toBeVisible()
  })

  it('leaves out the town when the bowler has none', async () => {
    serve({ bowlers: [result({ city: '', state: '' })], more: false })
    const { user } = open()

    await searchFor(user)

    expect(await screen.findByText('1234-56789')).toBeVisible()
  })

  it('marks a registered bowler with the division, and nobody else', async () => {
    serve({
      bowlers: [
        result({ registered: { divisionName: 'Handicap' } }),
        result({ id: 'b2', name: 'Maria Gonzales' }),
      ],
      more: false,
    })
    const { user } = open()

    await searchFor(user)

    expect(await screen.findAllByText(/Registered/)).toHaveLength(1)
    expect(screen.getByText('✓ Registered: Handicap')).toBeVisible()
  })

  it('names each Pick button with the bowler and the USBC ID, or without one', async () => {
    serve({
      bowlers: [result(), result({ id: 'b2', name: 'Maria Gonzales', usbcId: '' })],
      more: false,
    })
    const { user } = open()

    await searchFor(user)

    expect(
      await screen.findByRole('button', { name: 'Pick Maria Gonzalez, 1234-56789' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Pick Maria Gonzales' })).toBeVisible()
  })

  it('says the list was cut only when the API says so', async () => {
    serve({ bowlers: [result()], more: true })
    const { user } = open()

    await searchFor(user)

    expect(await screen.findByText(/Showing the first 25/)).toBeVisible()
  })

  it('does not say the list was cut when it was not', async () => {
    serve({ bowlers: [result()], more: false })
    const { user } = open()

    await searchFor(user)

    await screen.findByRole('heading', { name: '1 bowler found' })
    expect(screen.queryByText(/Showing the first 25/)).not.toBeInTheDocument()
  })

  it('reminds the desk the app does not match names', async () => {
    serve({ bowlers: [result()], more: false })
    const { user } = open()

    await searchFor(user)

    expect(await screen.findByText(/does not match names for you/)).toBeVisible()
  })

  it('hands the picked bowler up, and New bowler up', async () => {
    serve({ bowlers: [result({ id: 'b9' })], more: false })
    const { user, onPick, onNew } = open()
    await searchFor(user)

    await user.click(await screen.findByRole('button', { name: /^Pick Maria Gonzalez/ }))
    await user.click(screen.getByRole('button', { name: 'New bowler' }))

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'b9' }))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('sends every box, with the first and last name and the email as typed', async () => {
    const queries = serve({ bowlers: [], more: false })
    const { user } = open()

    await user.type(screen.getByLabelText('Last name starts with'), 'Gon')
    await user.type(screen.getByLabelText('First name starts with'), 'Mar')
    await user.type(screen.getByLabelText('Email'), 'm@example.com')
    await user.type(screen.getByLabelText('USBC ID'), '1234-56789')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    await screen.findByText(/No bowler matches/)
    const params = new URLSearchParams(queries[0])
    expect(Object.fromEntries(params)).toEqual({
      tournamentId: 't1',
      lastName: 'Gon',
      firstName: 'Mar',
      email: 'm@example.com',
      usbcId: '1234-56789',
    })
  })

  it('shows a failure with Try again that searches again', async () => {
    let failing = true
    serve(() =>
      failing
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json({ bowlers: [result()], more: false }),
    )
    const { user } = open()
    await searchFor(user)
    expect(await screen.findByText('Could not search for bowlers.')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to search for bowlers (500)')

    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: '1 bowler found' })).toBeVisible()
    expect(screen.queryByText('Could not search for bowlers.')).not.toBeInTheDocument()
  })
})
