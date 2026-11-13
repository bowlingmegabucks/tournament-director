import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Blocker } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { LeaveDialog } from './LeaveDialog'

function blockedBlocker() {
  const proceed = vi.fn()
  const reset = vi.fn()
  const blocker: Blocker = {
    state: 'blocked',
    location: { pathname: '/elsewhere', search: '', hash: '', state: null, key: 'k' },
    proceed,
    reset,
  }
  return { blocker, proceed, reset }
}

describe('LeaveDialog', () => {
  it('shows nothing while no move is held', () => {
    render(
      <LeaveDialog
        blocker={{ state: 'unblocked', location: undefined, proceed: undefined, reset: undefined }}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks the question with Stay and Leave', () => {
    render(<LeaveDialog blocker={blockedBlocker().blocker} />)
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stay on this page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave page' })).toBeInTheDocument()
  })

  it('goes on when the director picks Leave', async () => {
    const { blocker, proceed, reset } = blockedBlocker()
    render(<LeaveDialog blocker={blocker} />)
    await userEvent.click(screen.getByRole('button', { name: 'Leave page' }))
    expect(proceed).toHaveBeenCalledOnce()
    expect(reset).not.toHaveBeenCalled()
  })

  it('stays when the director picks Stay', async () => {
    const { blocker, proceed, reset } = blockedBlocker()
    render(<LeaveDialog blocker={blocker} />)
    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(proceed).not.toHaveBeenCalled()
  })
})
