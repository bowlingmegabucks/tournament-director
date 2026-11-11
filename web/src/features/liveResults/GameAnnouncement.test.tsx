import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameAnnouncement } from './GameAnnouncement'
import type { Announcement } from './liveLogic'

const game: Announcement = {
  variant: 'game',
  kicker: 'Game 2 complete',
  title: 'Scratch Division',
  game: 2,
}
const last: Announcement = {
  variant: 'last',
  kicker: 'Final game complete',
  title: 'Scratch Division',
  game: 4,
}

describe('GameAnnouncement (D-255)', () => {
  it('draws the game number, the kicker, and the division in a lower third', () => {
    render(<GameAnnouncement announcement={game} id={1} waiting={0} />)

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Game 2 complete')).toBeInTheDocument()
    expect(screen.getByText('Scratch Division')).toBeInTheDocument()
  })

  it('draws the last game with its own words', () => {
    render(<GameAnnouncement announcement={last} id={1} waiting={0} />)

    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Final game complete')).toBeInTheDocument()
    expect(screen.getByText('Scratch Division')).toBeInTheDocument()
  })

  it('is hidden from screen readers, for the strip says the same', () => {
    const { container } = render(<GameAnnouncement announcement={game} id={1} waiting={0} />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('says how many wait, and nothing when none does', () => {
    const { rerender } = render(<GameAnnouncement announcement={game} id={1} waiting={3} />)
    expect(screen.getByText('+3 more waiting')).toBeInTheDocument()

    rerender(<GameAnnouncement announcement={game} id={1} waiting={0} />)
    expect(screen.queryByText(/more waiting/)).not.toBeInTheDocument()

    rerender(<GameAnnouncement announcement={last} id={1} waiting={1} />)
    expect(screen.getByText('+1 more waiting')).toBeInTheDocument()
  })

  it('draws again for the next message: a new id replaces the element', () => {
    const { container, rerender } = render(
      <GameAnnouncement announcement={game} id={1} waiting={0} />,
    )
    const first = container.firstElementChild

    rerender(<GameAnnouncement announcement={game} id={2} waiting={0} />)

    expect(container.firstElementChild).not.toBe(first)
  })

  it('shows for the time a message shows', () => {
    const { container } = render(<GameAnnouncement announcement={game} id={1} waiting={0} />)

    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--duration')).toBe(
      '5000ms',
    )
  })
})
