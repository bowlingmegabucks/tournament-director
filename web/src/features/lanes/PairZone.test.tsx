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
  extra: { savingIds?: ReadonlySet<string>; fresh?: boolean } = {},
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
          {...extra}
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

  it('marks the rows whose moves are still being saved as busy (D-220)', () => {
    const [a, b] = bowlers(2)
    if (!a || !b) throw new Error('No bowlers')
    show(createLanePair(3, [a, b]), undefined, false, undefined, {
      savingIds: new Set([a.registrationId]),
    })

    expect(screen.getByText(a.name).closest('li')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(b.name).closest('li')).toHaveAttribute('aria-busy', 'false')
  })

  it('draws an accent edge when another desk just changed the pair, and not otherwise (LAN-21)', () => {
    const { unmount } = show(createLanePair(3, bowlers(1)), undefined, false, undefined, {
      fresh: true,
    })
    expect(screen.getByRole('heading', { level: 3 }).closest('li')?.className).toMatch(/fresh/)
    unmount()

    show(createLanePair(3, bowlers(1)))
    expect(screen.getByRole('heading', { level: 3 }).closest('li')?.className).not.toMatch(/fresh/)
  })
})

describe('PairZone in and out of play (OOP-01, OOP-03)', () => {
  const out = { ...createLanePair(3), outOfPlay: true }

  function showToggle(pair: LanePair, savingInPlay?: boolean) {
    const calls: boolean[] = []
    render(
      <DragDropProvider>
        <ul>
          <PairZone
            pair={pair}
            kind="squad"
            dragging={undefined}
            readOnly={false}
            savingInPlay={savingInPlay}
            onSetInPlay={(_pair, inPlay) => calls.push(inPlay)}
            onAssign={() => undefined}
          />
        </ul>
      </DragDropProvider>,
    )
    return calls
  }

  it('has a checked box for a pair in play, and reports an uncheck', async () => {
    const calls = showToggle(createLanePair(3))
    const box = screen.getByRole('checkbox', { name: 'Lanes 3-4 in play' })
    expect(box).toBeChecked()

    await userEvent.click(box)

    expect(calls).toEqual([false])
  })

  it('says a pair is out of play, with its box unchecked', () => {
    showToggle(out)

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Lanes 3-4 Out of play')
    expect(screen.getByText('No one can be put on these lanes.')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Lanes 3-4 in play' })).not.toBeChecked()
  })

  it('shows what was asked for, keeps focus, and takes no more clicks, while saving', async () => {
    const calls = showToggle(createLanePair(3), false)
    const box = screen.getByRole('checkbox')

    await userEvent.click(box)

    expect(box).not.toBeChecked()
    expect(box).toHaveAttribute('aria-disabled', 'true')
    expect(box).toBeEnabled()
    expect(box).toHaveFocus()
    expect(screen.getByText('Saving…')).toBeVisible()
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-busy', 'true')
    expect(calls).toEqual([])
  })

  it('says nothing about saving when nothing is', () => {
    showToggle(createLanePair(3))

    expect(screen.queryByText('Saving…')).not.toBeInTheDocument()
    expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled')
  })

  it('has no box without a way to change it, but still says it is out', () => {
    show(out)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Out of play')
  })

  it('shows a refusal when a bowler is dragged (OOP-02)', () => {
    show(out, createLaneBowler())

    expect(screen.getByText('Out of play: cannot drop here')).toBeVisible()
  })
})
