import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DragDropProvider } from '@dnd-kit/react'
import { createLaneBowler, createLanePair } from '../../mocks/data'
import { PairZone } from './PairZone'
import type { LaneBowler, LanePair } from './types'

const bowlers = (count: number) => Array.from({ length: count }, () => createLaneBowler())

function show(
  pair: LanePair,
  dragging?: LaneBowler,
  readOnly = false,
  onAssign: (bowler: LaneBowler) => void = () => undefined,
) {
  return render(
    <DragDropProvider>
      <ul>
        <PairZone
          pair={pair}
          kind="squad"
          dragging={dragging}
          readOnly={readOnly}
          onAssign={onAssign}
        />
      </ul>
    </DragDropProvider>,
  )
}

describe('PairZone', () => {
  it('shows the lanes and how full the pair is (LAN-03, D-58)', () => {
    show(createLanePair(3, bowlers(2)))

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Lanes 3-4 2 of 5')
  })

  it('shows a cue for a bowler who would fit: seats left (D-58)', () => {
    show(createLanePair(3, bowlers(2)), createLaneBowler())

    expect(screen.getByText('Drop here: 3 seats left')).toBeVisible()
  })

  it('says seat, not seats, when one is left', () => {
    show(createLanePair(3, bowlers(4)), createLaneBowler())

    expect(screen.getByText('Drop here: 1 seat left')).toBeVisible()
  })

  it('shows a refusal for a full pair (D-56, D-58)', () => {
    show(createLanePair(3, bowlers(5)), createLaneBowler())

    expect(screen.getByText('Full: cannot drop here')).toBeVisible()
    expect(screen.queryByText(/Drop here/)).not.toBeInTheDocument()
  })

  it('shows no cue for the pair a bowler is already in (D-57)', () => {
    const inside = createLaneBowler({ position: '3A' })

    show(createLanePair(3, [inside, ...bowlers(1)]), inside)

    expect(screen.queryByText(/Drop here|Full: cannot/)).not.toBeInTheDocument()
  })

  it('shows no cue when nothing is dragged', () => {
    show(createLanePair(3, bowlers(2)))

    expect(screen.queryByText(/Drop here|Full: cannot/)).not.toBeInTheDocument()
  })

  it('says a pair with nobody is empty, and lists no bowlers', () => {
    show(createLanePair(3))

    expect(screen.getByText('No one yet.')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lists the bowlers with handles and Move buttons while the squad is open (D-58)', async () => {
    const calls: string[] = []
    const joe = createLaneBowler({ name: 'Joe Fontaine', position: '3A' })
    show(createLanePair(3, [joe]), undefined, false, () => {
      calls.push('assign')
    })

    const row = screen.getByText('Joe Fontaine').closest('li')
    if (!row) throw new Error('No row')
    expect(within(row).getByRole('button', { name: 'Drag Joe Fontaine' })).toBeVisible()
    await userEvent.click(within(row).getByRole('button', { name: 'Move Joe Fontaine' }))

    expect(calls).toEqual(['assign'])
    expect(within(row).getByText('3A')).toBeVisible()
  })

  it('lists the bowlers with no handle or button when read only (LAN-13)', () => {
    show(
      createLanePair(3, [createLaneBowler({ name: 'Joe Fontaine', position: '3A' })]),
      undefined,
      true,
    )

    expect(screen.getByText('Joe Fontaine')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
