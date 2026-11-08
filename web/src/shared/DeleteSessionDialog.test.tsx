import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteSessionDialog } from './DeleteSessionDialog'
import type { SessionDeleteInfo } from './sessionDeleteApi'
import type { SessionKind } from './sessionEditApi'

function show(
  props: {
    kind?: SessionKind
    info?: SessionDeleteInfo
    loading?: boolean
    pending?: boolean
    failure?: string
    onConfirm?: () => void
    onClose?: () => void
  } = {},
) {
  render(
    <DeleteSessionDialog
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

const none: SessionDeleteInfo = { entryCount: 0, scoreCount: 0 }
const squadDialog = () => screen.getByRole('dialog', { name: 'Delete this squad?' })

describe('DeleteSessionDialog, a squad (SQD-14, D-186, D-188)', () => {
  it('names the squad by its date and says the delete cannot be undone', () => {
    show({ info: none })

    expect(squadDialog()).toHaveTextContent(
      'Sat 10/24/2026 9:00 AM will be deleted. This cannot be undone.',
    )
    expect(squadDialog()).not.toHaveTextContent('bonus pins')
  })

  it('waits for the counts: Delete is off (D-188)', () => {
    show({ loading: true })

    expect(squadDialog()).toHaveTextContent('will be deleted. This cannot be undone.')
    expect(screen.getByRole('button', { name: 'Delete squad' })).toBeDisabled()
  })

  it('still works when the counts could not be read (D-188)', () => {
    show({ info: undefined })

    expect(squadDialog()).toHaveTextContent('will be deleted')
    expect(screen.getByRole('button', { name: 'Delete squad' })).toBeEnabled()
  })

  it('shows the refusal and only Close when bowlers are entered (D-186)', () => {
    show({ info: { entryCount: 12, scoreCount: 0 } })

    expect(squadDialog()).toHaveTextContent(
      '12 bowlers are entered in Sat 10/24/2026 9:00 AM. Remove them from the squad first.',
    )
    expect(squadDialog()).not.toHaveTextContent('will be deleted')
    expect(squadDialog()).not.toHaveTextContent('Scores are saved')
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Delete squad/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('uses the singular for one entered bowler', () => {
    show({ info: { entryCount: 1, scoreCount: 0 } })

    expect(squadDialog()).toHaveTextContent('1 bowler is entered in')
  })

  it('says scores are saved when only scores hold it (D-186)', () => {
    show({ info: { entryCount: 0, scoreCount: 5 } })

    expect(squadDialog()).toHaveTextContent(
      'Scores are saved for Sat 10/24/2026 9:00 AM, so it cannot be deleted.',
    )
    expect(squadDialog()).not.toHaveTextContent('entered')
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
  })

  it('gives both reasons when bowlers are entered and scores are saved (D-186)', () => {
    show({ info: { entryCount: 1, scoreCount: 5 } })

    expect(squadDialog()).toHaveTextContent(
      '1 bowler is entered in Sat 10/24/2026 9:00 AM. Remove them from the squad first. Scores are saved for it, so it stays.',
    )
  })

  it('closes when Cancel is pressed and confirms when Delete is pressed', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    show({ info: none, onClose, onConfirm })

    await user.click(screen.getByRole('button', { name: 'Delete squad' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows Deleting… and turns both buttons off while the request runs', () => {
    show({ info: none, pending: true })

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('shows why a request failed as an alert', () => {
    show({ info: none, failure: 'Failed to delete the squad (500)' })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to delete the squad (500)')
  })
})

describe('DeleteSessionDialog, a sweeper (SQD-14, D-186, D-188)', () => {
  const sweeperDialog = () => screen.getByRole('dialog', { name: 'Delete this sweeper?' })

  it('says the bonus pins go too (D-152)', () => {
    show({ kind: 'sweepers', info: none })

    expect(sweeperDialog()).toHaveTextContent(
      'Sat 10/24/2026 9:00 AM will be deleted. Its bonus pins go too. This cannot be undone.',
    )
    expect(screen.getByRole('button', { name: 'Delete sweeper' })).toBeEnabled()
  })

  it('names the sweeper in a refusal', () => {
    show({ kind: 'sweepers', info: { entryCount: 3, scoreCount: 0 } })

    expect(sweeperDialog()).toHaveTextContent(
      '3 bowlers are entered in Sat 10/24/2026 9:00 AM. Remove them from the sweeper first.',
    )
  })

  it('says scores are saved', () => {
    show({ kind: 'sweepers', info: { entryCount: 0, scoreCount: 30 } })

    expect(sweeperDialog()).toHaveTextContent('Scores are saved for Sat 10/24/2026 9:00 AM')
  })
})
