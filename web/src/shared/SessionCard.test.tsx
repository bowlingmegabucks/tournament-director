import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { createSquad } from '../mocks/data'
import { Fact, SessionCard, SessionList } from './SessionCard'

function renderCard(action?: React.ReactNode) {
  return render(
    <MemoryRouter>
      <SessionList>
        <SessionCard
          session={createSquad({ date: '2026-10-24T09:00:00', complete: false })}
          href="s1"
          facts={<Fact label="Entry fee">$50.00</Fact>}
          action={action}
        />
      </SessionList>
    </MemoryRouter>,
  )
}

describe('SessionCard', () => {
  it('titles the card with the date and says Open or Complete (D-44)', () => {
    renderCard()

    const heading = screen.getByRole('heading', { level: 2 })
    expect(within(heading).getByRole('link')).toHaveTextContent('Sat 10/24/2026 9:00 AM')
    expect(within(heading).getByText('Open')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sat 10/24/2026 9:00 AM' })).toHaveAttribute(
      'href',
      '/s1',
    )
  })

  it('shows lanes, per pair, and the facts it is given', () => {
    renderCard()

    expect(screen.getByText('Lanes')).toBeVisible()
    expect(screen.getByText('Per pair')).toBeVisible()
    expect(screen.getByText('$50.00')).toBeVisible()
  })

  it('puts every action side by side, Edit then Delete (D-185, D-188)', () => {
    renderCard(
      <>
        <a href="/edit">Edit</a>
        <button type="button">Delete</button>
      </>,
    )

    const edit = screen.getByRole('link', { name: 'Edit' })
    const remove = screen.getByRole('button', { name: 'Delete' })
    expect(edit.parentElement).toBe(remove.parentElement)
    expect(edit.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no action area when there is no action', () => {
    renderCard()

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})
