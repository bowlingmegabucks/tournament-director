import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnverifiedChip } from './UnverifiedChip'

describe('UnverifiedChip (AVG-13)', () => {
  it('says the average is not verified', () => {
    render(<UnverifiedChip show />)

    expect(screen.getByText('Avg not verified')).toBeInTheDocument()
  })

  it('shows nothing for a scratch or checked bowler', () => {
    render(<UnverifiedChip show={false} />)

    expect(screen.queryByText('Avg not verified')).not.toBeInTheDocument()
  })
})
