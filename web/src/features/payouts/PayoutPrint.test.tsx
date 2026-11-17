import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PayoutPrintSheet, PrintPayoutsButton, type PayoutPrintSheetProps } from './PayoutPrint'

const sheet: PayoutPrintSheetProps = {
  tournamentName: 'Spring Open',
  title: 'Squad payouts',
  subtitle: 'Sat 10/24/2026 9:00 AM',
  columns: [
    { id: 'bowler', label: 'Bowler' },
    { id: 'amount', label: 'Amount', num: true },
  ],
  rows: [
    { key: 'a', cells: ['Dana Whitfield', '$100.00'] },
    { key: 'b', cells: ['Marcus Lee', '$250.00'] },
  ],
  figures: ['2 payouts', 'Total $350.00'],
  printedOn: '10/25/2026',
}

let print: ReturnType<typeof vi.fn>

beforeEach(() => {
  print = vi.fn()
  vi.stubGlobal('print', print)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.body.dataset.payoutPrinting
})

describe('PayoutPrintSheet (PAY-22)', () => {
  it('drops a cell past the last column and leaves a short row blank', () => {
    render(
      <PayoutPrintSheet
        {...sheet}
        rows={[
          { key: 'a', cells: ['Dana Whitfield', '$100.00', 'extra'] },
          { key: 'b', cells: ['Marcus Lee'] },
        ]}
      />,
    )

    expect(screen.queryByText('extra')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('Marcus Lee')).toBeVisible()
  })

  it('prints today’s date when no date is given', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 26, 12))
    render(<PayoutPrintSheet {...sheet} printedOn={undefined} />)
    vi.useRealTimers()

    expect(screen.getByText(/Printed 10\/26\/2026/)).toBeVisible()
  })

  it('shows the title, tournament, figures, and a row for each payout', () => {
    render(<PayoutPrintSheet {...sheet} />)

    expect(screen.getByRole('heading', { name: 'Squad payouts' })).toBeVisible()
    expect(screen.getByText('Spring Open · Sat 10/24/2026 9:00 AM')).toBeVisible()
    expect(screen.getByText(/2 payouts/)).toBeVisible()
    expect(screen.getByText(/Total \$350\.00/)).toBeVisible()
    expect(screen.getByText(/Printed 10\/25\/2026/)).toBeVisible()
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1] as HTMLElement).getByText('$100.00')).toBeVisible()
  })

  it('adds a blank Received by column only when asked', () => {
    const { rerender } = render(<PayoutPrintSheet {...sheet} />)
    expect(screen.queryByRole('columnheader', { name: 'Received by' })).toBeNull()

    rerender(<PayoutPrintSheet {...sheet} signature />)

    expect(screen.getByRole('columnheader', { name: 'Received by' })).toBeVisible()
  })

  it('leaves out the subtitle separator when there is no subtitle', () => {
    render(<PayoutPrintSheet {...sheet} subtitle={undefined} />)

    expect(screen.getByText('Spring Open')).toBeVisible()
  })
})

describe('PrintPayoutsButton (PAY-22)', () => {
  it('prints nothing until pressed', () => {
    render(<PrintPayoutsButton {...sheet} />)

    expect(screen.queryByRole('heading', { name: 'Squad payouts' })).toBeNull()
    expect(print).not.toHaveBeenCalled()
  })

  it('puts the sheet on the page, marks the page, and opens the print dialog', async () => {
    const user = userEvent.setup()
    render(<PrintPayoutsButton {...sheet} label="Print payouts" />)

    await user.click(screen.getByRole('button', { name: 'Print payouts' }))

    expect(print).toHaveBeenCalledTimes(1)
    expect(document.body).toHaveAttribute('data-payout-printing', '')
    expect(document.querySelector('[data-payout-print-copy]')).toHaveTextContent('Dana Whitfield')
  })

  it('takes the copy away when the browser says printing is over', async () => {
    const user = userEvent.setup()
    render(<PrintPayoutsButton {...sheet} />)
    await user.click(screen.getByRole('button', { name: 'Print' }))

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })

    expect(document.querySelector('[data-payout-print-copy]')).toBeNull()
    expect(document.body).not.toHaveAttribute('data-payout-printing')
  })

  it('ignores a second press while the first print is open', async () => {
    const user = userEvent.setup()
    render(<PrintPayoutsButton {...sheet} />)

    await user.click(screen.getByRole('button', { name: 'Print' }))
    await user.click(screen.getByRole('button', { name: 'Print' }))

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('unmarks the page when it unmounts mid-print', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<PrintPayoutsButton {...sheet} />)
    await user.click(screen.getByRole('button', { name: 'Print' }))

    unmount()

    expect(document.body).not.toHaveAttribute('data-payout-printing')
  })

  it('unmarks the page and throws when the dialog cannot open', async () => {
    print.mockImplementation(() => {
      throw new Error('blocked')
    })
    const user = userEvent.setup()
    // React reports the error from a click handler to the window; swallow it here.
    const swallow = (event: ErrorEvent) => {
      event.preventDefault()
    }
    window.addEventListener('error', swallow)
    render(<PrintPayoutsButton {...sheet} />)

    await user.click(screen.getByRole('button', { name: 'Print' }))

    window.removeEventListener('error', swallow)
    expect(document.body).not.toHaveAttribute('data-payout-printing')
    expect(document.querySelector('[data-payout-print-copy]')).toBeNull()
  })
})
