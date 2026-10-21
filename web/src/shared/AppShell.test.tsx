import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { renderApp } from '../test/renderApp'

const mainMenu = () => screen.getByRole('navigation', { name: 'Main' })

describe('AppShell', () => {
  it('shows the logo and the main menu on Home (NAV-01)', async () => {
    renderApp('/')

    expect(screen.getByRole('img', { name: 'Northeast MegaBuck$ Tournament' })).toBeVisible()
    expect(
      within(mainMenu())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Home', 'Tournaments'])
    await screen.findByRole('link', { name: 'All tournaments' })
  })

  it('marks Home as the current page only on Home (NAV-01)', async () => {
    renderApp('/')

    expect(within(mainMenu()).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(mainMenu()).getByRole('link', { name: 'Tournaments' })).not.toHaveAttribute(
      'aria-current',
    )
    await screen.findByRole('link', { name: 'All tournaments' })
  })

  it('moves between pages from the menu (NAV-01)', async () => {
    server.use(http.get('/v1/tournaments', () => HttpResponse.json({ tournaments: [] })))
    renderApp('/')

    await userEvent.click(within(mainMenu()).getByRole('link', { name: 'Tournaments' }))

    expect(await screen.findByRole('heading', { name: 'Tournaments', level: 1 })).toBeVisible()
    expect(within(mainMenu()).getByRole('link', { name: 'Tournaments' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await userEvent.click(within(mainMenu()).getByRole('link', { name: 'Home' }))
    expect(await screen.findByRole('heading', { name: 'Tournament Management' })).toBeVisible()
  })

  it('shows page not found for an unknown address (NAV-03)', () => {
    renderApp('/nowhere')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/')
    expect(within(mainMenu()).getByRole('link', { name: 'Home' })).toBeVisible()
  })

  it('gives each page its own title (NAV-01)', async () => {
    server.use(http.get('/v1/tournaments', () => HttpResponse.json({ tournaments: [] })))

    renderApp('/tournaments')

    await screen.findByText('No tournaments yet.')
    expect(document.title).toBe('Tournaments · Tournament Director')
  })
})
