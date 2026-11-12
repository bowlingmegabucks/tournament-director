import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DangerItem, DangerZone } from './DangerZone'

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

  it('holds several items, each with its sentence and trigger (D-260)', () => {
    render(
      <DangerZone>
        <DangerItem description="Complete it.">
          <button type="button">Complete thing</button>
        </DangerItem>
        <DangerItem description="Delete it.">
          <button type="button">Delete thing</button>
        </DangerItem>
      </DangerZone>,
    )
    const zone = screen.getByRole('region', { name: 'Danger zone' })
    expect(zone).toHaveTextContent('Complete it.')
    expect(zone).toHaveTextContent('Delete it.')
    expect(screen.getByRole('button', { name: 'Complete thing' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete thing' })).toBeVisible()
    expect(screen.getAllByRole('heading', { name: 'Danger zone' })).toHaveLength(1)
  })
})
