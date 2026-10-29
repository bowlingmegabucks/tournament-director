import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DragDropProvider } from '@dnd-kit/react'
import { createLaneBowler } from '../../mocks/data'
import { UnassignedList } from './UnassignedList'
import type { LaneBowler } from './types'

function show(bowlers: LaneBowler[], dragging?: LaneBowler, readOnly = false) {
  return render(
    <DragDropProvider>
      <UnassignedList
        bowlers={bowlers}
        kind="squad"
        dragging={dragging}
        readOnly={readOnly}
        onAssign={() => undefined}
      />
    </DragDropProvider>,
  )
}

describe('UnassignedList', () => {
  it('counts the bowlers in its title and lists them in a labeled scrolling region (LAN-10, D-58)', () => {
    show([createLaneBowler({ name: 'Pat Nguyen' }), createLaneBowler({ name: 'Carl Dubois' })])

    expect(screen.getByRole('heading', { name: 'Unassigned (2)' })).toBeVisible()
    const region = screen.getByRole('region', { name: 'Unassigned bowlers' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveTextContent('Pat Nguyen')
  })

  it('says everyone has a lane when it is empty, with no scrolling region', () => {
    show([])

    expect(screen.getByRole('heading', { name: 'Unassigned (0)' })).toBeVisible()
    expect(screen.getByText('Everyone has a lane.')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Unassigned bowlers' })).not.toBeInTheDocument()
  })

  it('invites a bowler who has a lane to be dropped here to clear it (D-57, D-58)', () => {
    show([], createLaneBowler({ position: '1A' }))

    expect(screen.getByText('Drop here to clear the lane')).toBeVisible()
  })

  it('shows no cue for a bowler who has no lane, or when nothing is dragged', () => {
    const { unmount } = show([], createLaneBowler({ position: '' }))
    expect(screen.queryByText(/Drop here/)).not.toBeInTheDocument()
    unmount()

    show([])
    expect(screen.queryByText(/Drop here/)).not.toBeInTheDocument()
  })

  it('has no handles or buttons when read only (LAN-13)', () => {
    show([createLaneBowler({ name: 'Pat Nguyen' })], undefined, true)

    expect(screen.getByText('Pat Nguyen')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
