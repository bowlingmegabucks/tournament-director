import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast } from './Toast'

describe('Toast', () => {
  it('announces a success politely, with a check mark', () => {
    render(
      <Toast kind="success" onDismiss={() => {}}>
        Saved
      </Toast>,
    )

    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Saved')
    expect(toast.className).toMatch(/success/)
    expect(toast.className).not.toMatch(/error/)
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getAllByText('✕')).toHaveLength(1) // the dismiss button's only
  })

  it('announces an error as an alert, with a cross', () => {
    render(
      <Toast kind="error" onDismiss={() => {}}>
        Failed
      </Toast>,
    )

    const toast = screen.getByRole('alert')
    expect(toast).toHaveTextContent('Failed')
    expect(toast.className).toMatch(/error/)
    expect(toast.className).not.toMatch(/success/)
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    expect(screen.getAllByText('✕')).toHaveLength(2) // icon and dismiss button
  })

  it('calls onDismiss when the user presses Dismiss', async () => {
    const onDismiss = vi.fn()
    render(
      <Toast kind="success" onDismiss={onDismiss}>
        Saved
      </Toast>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
