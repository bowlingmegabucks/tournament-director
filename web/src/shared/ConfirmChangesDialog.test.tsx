import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmChangesDialog } from './ConfirmChangesDialog'

const items = [
  { field: 'entryFee', message: 'Bowlers are registered.', change: 'Entry fee: $60.00 → $75.00' },
  { field: 'startDate', message: 'The start date moves.', change: '' },
]

function setup(props: Partial<Parameters<typeof ConfirmChangesDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <ConfirmChangesDialog
      items={items}
      pending={false}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  )
  return { onConfirm, onClose }
}

describe('ConfirmChangesDialog (TRN-30, D-129)', () => {
  it('uses the default title and button', () => {
    setup()

    expect(screen.getByRole('dialog', { name: 'Save these changes?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save anyway' })).toBeEnabled()
  })

  it('takes a custom title and button label', () => {
    setup({ title: 'Create this division?', confirmLabel: 'Create anyway' })

    expect(screen.getByRole('dialog', { name: 'Create this division?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create anyway' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save anyway' })).not.toBeInTheDocument()
  })

  it('lists each message, and the change only when there is one', () => {
    setup()

    expect(screen.getByText('Bowlers are registered.')).toBeInTheDocument()
    expect(screen.getByText('Entry fee: $60.00 → $75.00')).toBeInTheDocument()
    expect(screen.getByText('The start date moves.')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByRole('listitem')[1].querySelector('small')).toBeNull()
  })

  it('calls onConfirm when the director goes ahead', async () => {
    const { onConfirm } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Save anyway' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('closes on Go back and tells the parent', async () => {
    const { onClose, onConfirm } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('says Saving… and disables both buttons while pending', () => {
    setup({ pending: true, confirmLabel: 'Create anyway' })

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Create anyway' })).not.toBeInTheDocument()
  })

  it('shows a failure as an alert, and none when there is no failure', () => {
    const { unmount } = render(
      <ConfirmChangesDialog
        items={items}
        pending={false}
        failure="Could not save."
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.')
    unmount()

    setup()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
