import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DangerZone } from './DangerZone'

describe('DangerZone (D-215)', () => {
  it('is a labelled section with a heading, the description, and the trigger', () => {
    render(
      <DangerZone description="This cannot be undone.">
        <button type="button">Delete thing</button>
      </DangerZone>,
    )
    const zone = screen.getByRole('region', { name: 'Danger zone' })
    expect(zone).toHaveTextContent('This cannot be undone.')
    expect(screen.getByRole('heading', { level: 2, name: 'Danger zone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete thing' })).toBeInTheDocument()
  })
})
