import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ModeToggle } from './ModeToggle'
import type { RankMode } from './types'

function Address() {
  const location = useLocation()
  return <output aria-label="address">{location.pathname + location.search}</output>
}

function renderToggle(mode: RankMode, start = '/results') {
  render(
    <MemoryRouter initialEntries={[start]}>
      <ModeToggle mode={mode} steadyLabel="Through game 3" />
      <Address />
    </MemoryRouter>,
  )
}

const address = () => screen.getByLabelText('address').textContent

describe('ModeToggle (RES-45, D-239)', () => {
  it('shows the Ranking group with the steady label and Live', () => {
    renderToggle('full-game')

    expect(screen.getByRole('group', { name: 'Ranking' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Through game 3' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Live' })).not.toBeChecked()
  })

  it('checks Live when the page is in live mode', () => {
    renderToggle('live')

    expect(screen.getByRole('radio', { name: 'Live' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Through game 3' })).not.toBeChecked()
  })

  it('puts mode=live in the address and keeps the other parameters', async () => {
    renderToggle('full-game', '/results?division=d1')

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Live' }))

    expect(address()).toBe('/results?division=d1&mode=live')
  })

  it('takes mode out of the address for the default, so the link stays clean', async () => {
    renderToggle('live', '/results?mode=live&division=d1')

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Through game 3' }))

    expect(address()).toBe('/results?division=d1')
  })
})
