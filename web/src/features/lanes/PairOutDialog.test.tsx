import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createLaneBowler, createLanePair } from '../../mocks/data'
import { PairOutDialog } from './PairOutDialog'

const named = (...names: string[]) =>
  createLanePair(
    3,
    names.map((name) => createLaneBowler({ name })),
  )

function show(pair = named('Pat Nguyen'), onConfirm = vi.fn(), onClose = vi.fn()) {
  render(<PairOutDialog pair={pair} onConfirm={onConfirm} onClose={onClose} />)
  return { onConfirm, onClose }
}

describe('PairOutDialog (OOP-04)', () => {
  it.each([
    [['Pat Nguyen'], 'Pat Nguyen will move to unassigned.'],
    [['Pat', 'Joe'], 'Pat and Joe will move to unassigned.'],
    [['Pat', 'Joe', 'Dana'], 'Pat, Joe, and Dana will move to unassigned.'],
    [[], 'Anyone on this pair will move to unassigned.'],
  ])('names who will move: %j', (names, message) => {
    show(named(...names))

    expect(screen.getByRole('dialog', { name: 'Take lanes 3-4 out of play?' })).toBeVisible()
    expect(screen.getByText(message)).toBeVisible()
  })

  it('confirms, then closes itself so focus goes back', async () => {
    const { onConfirm, onClose } = show()

    await userEvent.click(screen.getByRole('button', { name: 'Take out of play' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('closes without confirming on Go back', async () => {
    const { onConfirm, onClose } = show()

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
