import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast } from './Toast'

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces a success politely, with a check mark', () => {
    render(
      <Toast kind="success" onDismiss={() => {}}>
        Saved
      </Toast>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.getByRole('status').tagName).toBe('OUTPUT')
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.queryByText('✕')).not.toBeInTheDocument()
  })

  it('announces an error as an alert, with a cross', () => {
    render(
      <Toast kind="error" onDismiss={() => {}}>
        Failed
      </Toast>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
    expect(screen.getByRole('alert').tagName).toBe('DIV')
    expect(screen.getByText('✕')).toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('announces an info politely, with an i', () => {
    render(
      <Toast kind="info" onDismiss={() => {}}>
        Not saved
      </Toast>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Not saved')
    expect(screen.getByText('ℹ')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    expect(screen.queryByText('✕')).not.toBeInTheDocument()
  })

  it('calls onDismiss when the user presses Dismiss', async () => {
    const onDismiss = vi.fn()
    render(
      <Toast kind="success" onDismiss={onDismiss}>
        Saved
      </Toast>,
    )

    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(dismiss).toHaveTextContent('×')
    await userEvent.click(dismiss)

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('calls onDismiss after autoDismissMs', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(
      <Toast kind="success" onDismiss={onDismiss} autoDismissMs={1000}>
        Saved
      </Toast>,
    )

    act(() => vi.advanceTimersByTime(999))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('stays until dismissed when there is no autoDismissMs', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(
      <Toast kind="error" onDismiss={onDismiss}>
        Failed
      </Toast>,
    )

    act(() => vi.advanceTimersByTime(60_000))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('does not call onDismiss after it unmounts', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const { unmount } = render(
      <Toast kind="success" onDismiss={onDismiss} autoDismissMs={1000}>
        Saved
      </Toast>,
    )

    unmount()
    act(() => vi.advanceTimersByTime(5000))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('restarts the timer when autoDismissMs changes', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const { rerender } = render(
      <Toast kind="success" onDismiss={onDismiss} autoDismissMs={1000}>
        Saved
      </Toast>,
    )
    act(() => vi.advanceTimersByTime(500))
    rerender(
      <Toast kind="success" onDismiss={onDismiss} autoDismissMs={3000}>
        Saved
      </Toast>,
    )

    act(() => vi.advanceTimersByTime(2999))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))

    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
