import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveStatus } from './LiveStatus'

describe('LiveStatus (LAN-19, D-217)', () => {
  it('says the page is live', () => {
    render(<LiveStatus state="live" updated={undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Live: changes by others show here as they happen.',
    )
  })

  it('says what another desk changed, in place of "Live"', () => {
    render(<LiveStatus state="live" updated="Updated: lanes 5-6" />)
    expect(screen.getByRole('status')).toHaveTextContent('Updated: lanes 5-6')
    expect(screen.queryByText(/changes by others/)).not.toBeInTheDocument()
  })

  it('says it is reconnecting', () => {
    render(<LiveStatus state="reconnecting" updated={undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reconnecting… The page refreshes when it is back.',
    )
  })

  it('says the updates are off, and ignores a stale update line', () => {
    render(<LiveStatus state="off" updated="Updated: lanes 5-6" />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Live updates are off. Reload the page to see changes by others.',
    )
  })

  it('keeps the dot out of what a screen reader hears', () => {
    const { container } = render(<LiveStatus state="live" updated={undefined} />)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
