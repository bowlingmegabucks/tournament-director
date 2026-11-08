import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompleteSessionDialog } from './CompleteSessionDialog'
import type { SessionCompleteInfo } from './sessionCompleteApi'
import type { SessionKind } from './sessionEditApi'

function show(
  props: {
    kind?: SessionKind
    info?: SessionCompleteInfo
    loading?: boolean
    pending?: boolean
    failure?: string
    onConfirm?: () => void
    onClose?: () => void
  } = {},
) {
  render(
    <CompleteSessionDialog
      kind={props.kind ?? 'squads'}
      dateLabel="Sat 10/24/2026 9:00 AM"
      info={props.info}
      loading={props.loading ?? false}
      pending={props.pending ?? false}
      failure={props.failure}
      onConfirm={props.onConfirm ?? (() => undefined)}
      onClose={props.onClose ?? (() => undefined)}
    />,
  )
}

const squadInfo = (info: Partial<SessionCompleteInfo> = {}): SessionCompleteInfo => ({
  entryCount: 12,
  noScoreCount: 0,
  partialCount: 0,
  games: 3,
  ...info,
})
const squadDialog = () => screen.getByRole('dialog', { name: 'Complete this squad?' })

describe('CompleteSessionDialog, a squad (SQD-15, SQD-18, D-194)', () => {
  it('names the squad by its date, counts the bowlers, and says it cannot be undone', () => {
    show({ info: squadInfo({ noScoreCount: 3 }) })

    expect(squadDialog()).toHaveTextContent('Sat 10/24/2026 9:00 AM: 12 bowlers are entered.')
    expect(squadDialog()).toHaveTextContent('This cannot be undone.')
    // Only a sweeper says nothing is filled in (D-191).
    expect(squadDialog()).not.toHaveTextContent('No scores are filled in')
  })

  it('tells how many get zeros and for how many games', () => {
    show({ info: squadInfo({ noScoreCount: 3, games: 5 }) })

    expect(screen.getByRole('listitem')).toHaveTextContent(
      '3 have no scores and will get 0 for each of 5 games.',
    )
  })

  it('says it in the singular for one bowler and one game', () => {
    show({ info: squadInfo({ entryCount: 1, noScoreCount: 1, games: 1 }) })

    expect(squadDialog()).toHaveTextContent('1 bowler is entered.')
    expect(screen.getByRole('listitem')).toHaveTextContent(
      '1 has no scores and will get 0 for each of 1 game.',
    )
  })

  it('says a bowler with some games stays as entered, and drops the zero line when none get zeros', () => {
    show({ info: squadInfo({ partialCount: 2 }) })

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveTextContent(
      '2 have fewer than 3 games and stays as entered.',
    )
  })

  it('lists both lines when some get zeros and some stay short', () => {
    show({ info: squadInfo({ noScoreCount: 1, partialCount: 1 }) })

    const lines = screen.getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent('1 has no scores')
    expect(lines[1]).toHaveTextContent('1 has fewer than 3 games and stays as entered.')
  })

  it('says all have scores, with no list, when nothing is filled in', () => {
    show({ info: squadInfo() })

    expect(squadDialog()).toHaveTextContent('All have scores, so no zeros are saved.')
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('says no bowlers are entered, and no lines, for an empty squad', () => {
    show({ info: squadInfo({ entryCount: 0 }) })

    expect(squadDialog()).toHaveTextContent('Sat 10/24/2026 9:00 AM: no bowlers are entered.')
    expect(squadDialog()).not.toHaveTextContent('All have scores')
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('shows loading and keeps Complete off until the counts arrive', () => {
    show({ loading: true })

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.getByRole('button', { name: 'Complete squad' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('still works, with a plain sentence, when the counts could not be read', () => {
    show({ info: undefined })

    expect(squadDialog()).toHaveTextContent(
      'Sat 10/24/2026 9:00 AM will be completed. Bowlers with no scores get 0 for each game. This cannot be undone.',
    )
    expect(screen.getByRole('button', { name: 'Complete squad' })).toBeEnabled()
  })

  it('asks for the confirm with the Complete button and shows no error at first', async () => {
    const onConfirm = vi.fn()
    show({ info: squadInfo(), onConfirm })

    await userEvent.click(screen.getByRole('button', { name: 'Complete squad' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes on Cancel without confirming', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    show({ info: squadInfo(), onClose, onConfirm })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables both buttons and says Completing… while it saves', () => {
    show({ info: squadInfo(), pending: true })

    expect(screen.getByRole('button', { name: 'Completing…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('shows why a save failed, in the dialog', () => {
    show({ info: squadInfo(), failure: 'Failed to complete the squad (503)' })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to complete the squad (503)')
    expect(screen.getByRole('button', { name: 'Complete squad' })).toBeEnabled()
  })
})

describe('CompleteSessionDialog, a sweeper (SQD-16, D-191, D-194)', () => {
  const sweeperDialog = () => screen.getByRole('dialog', { name: 'Complete this sweeper?' })

  it('says nothing is filled in', () => {
    show({ kind: 'sweepers', info: { entryCount: 9 } })

    expect(sweeperDialog()).toHaveTextContent(
      'Sat 10/24/2026 9:00 AM: 9 bowlers are entered. No scores are filled in.',
    )
    expect(sweeperDialog()).toHaveTextContent('This cannot be undone.')
    expect(screen.getByRole('button', { name: 'Complete sweeper' })).toBeEnabled()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    // A sweeper has no zeros to count (D-191).
    expect(sweeperDialog()).not.toHaveTextContent('All have scores')
  })

  it('says no bowlers are entered, without the fill-in line, for an empty sweeper', () => {
    show({ kind: 'sweepers', info: { entryCount: 0 } })

    expect(sweeperDialog()).toHaveTextContent('Sat 10/24/2026 9:00 AM: no bowlers are entered.')
    expect(sweeperDialog()).not.toHaveTextContent('No scores are filled in')
  })

  it('uses a plain sentence without the zero line when the counts could not be read', () => {
    show({ kind: 'sweepers', info: undefined })

    expect(sweeperDialog()).toHaveTextContent(
      'Sat 10/24/2026 9:00 AM will be completed. This cannot be undone.',
    )
    expect(sweeperDialog()).not.toHaveTextContent('get 0')
  })
})
