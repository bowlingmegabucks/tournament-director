import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AverageMarker } from './AverageMarker'

describe('AverageMarker (AVG-12, D-293)', () => {
  it('says the average is not verified, in words', () => {
    render(<AverageMarker />)

    expect(screen.getByText('Avg not verified')).toBeInTheDocument()
  })

  it('takes the words a table of averages uses', () => {
    render(<AverageMarker label="No average" />)

    expect(screen.getByText('No average')).toBeInTheDocument()
  })
})
