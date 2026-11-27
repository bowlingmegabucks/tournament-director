import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PayoutTag } from './PayoutTag'

describe('PayoutTag (PAY-20, D-284)', () => {
  it('shows the amount as dollars and cents', () => {
    render(<PayoutTag amount="1250.5" />)

    expect(screen.getByText('Payout $1,250.50')).toBeInTheDocument()
  })

  it('shows nothing when there is no saved payout', () => {
    const { container } = render(<PayoutTag amount={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('PayoutTag for SMART money (SMT-03)', () => {
  it('names it a scholarship, not a payout', () => {
    render(<PayoutTag amount="75" smartScholarship />)

    expect(screen.getByText('SMART scholarship $75.00')).toBeInTheDocument()
    expect(screen.queryByText(/Payout/)).toBeNull()
  })
})
