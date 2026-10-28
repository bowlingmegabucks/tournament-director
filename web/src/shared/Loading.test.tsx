import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Loading } from './Loading'

describe('Loading (D-53)', () => {
  it('shows the words in a status', () => {
    render(<Loading label="Loading squads…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading squads…')
  })

  it('hides the dots from screen readers', () => {
    const { container } = render(<Loading label="Loading squads…" />)

    const dots = container.querySelector('output [aria-hidden="true"]')
    expect(dots?.children).toHaveLength(3)
  })

  it('draws no placeholder bars by default', () => {
    const { container } = render(<Loading label="Loading squads…" />)

    expect(container.querySelector('div')).toBeNull()
  })

  it('draws up to twelve bars, one for each row asked for', () => {
    const { container } = render(<Loading label="Loading squads…" rows={12} />)

    expect(container.querySelector('div[aria-hidden="true"]')?.children).toHaveLength(12)
  })

  it('draws one hidden bar for each row asked for', () => {
    const { container } = render(<Loading label="Loading squads…" rows={4} />)

    const bars = container.querySelector('div[aria-hidden="true"]')
    expect(bars?.children).toHaveLength(4)
    expect(screen.getByRole('status')).not.toContainElement(bars as HTMLElement)
  })
})
