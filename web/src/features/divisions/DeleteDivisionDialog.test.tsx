import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteDivisionDialog } from './DeleteDivisionDialog'
import type { DivisionDeleteInfo } from './types'

function show(
  props: {
    info?: DivisionDeleteInfo
    loading?: boolean
    pending?: boolean
    failure?: string
    onConfirm?: () => void
    onClose?: () => void
  } = {},
) {
  render(
    <DeleteDivisionDialog
      divisionName="Women"
      info={props.info}
      loading={props.loading ?? false}
      pending={props.pending ?? false}
      failure={props.failure}
      onConfirm={props.onConfirm ?? (() => undefined)}
      onClose={props.onClose ?? (() => undefined)}
    />,
  )
}

const dialog = () => screen.getByRole('dialog', { name: 'Delete this division?' })

describe('DeleteDivisionDialog (DIV-12, D-151, D-152, D-153, D-154)', () => {
  it('names the division and says the delete cannot be undone, with no sweeper sentence for 0', () => {
    show({ info: { registrationCount: 0, sweeperCount: 0 } })

    expect(dialog()).toHaveTextContent(
      'Women will be deleted. Divisions after it move up one number. This cannot be undone.',
    )
    expect(dialog()).not.toHaveTextContent('sweeper')
  })

  it('says how many sweepers lose their bonus pins (D-152)', () => {
    show({ info: { registrationCount: 0, sweeperCount: 2 } })

    expect(dialog()).toHaveTextContent(
      'Women will be deleted. 2 sweepers lose their bonus pins for it. Divisions after it move up one number. This cannot be undone.',
    )
  })

  it('uses the singular for one sweeper', () => {
    show({ info: { registrationCount: 0, sweeperCount: 1 } })

    expect(dialog()).toHaveTextContent('1 sweeper loses its bonus pins for it.')
  })

  it('waits for the counts: the text is short and Delete is off (D-154)', () => {
    show({ loading: true })

    expect(dialog()).toHaveTextContent('Women will be deleted. This cannot be undone.')
    expect(screen.getByRole('button', { name: 'Delete division' })).toBeDisabled()
  })

  it('still works when the counts could not be read, and says pins may go too (D-154)', () => {
    show({ info: undefined })

    expect(dialog()).toHaveTextContent('Any sweeper bonus pins for it go too.')
    expect(screen.getByRole('button', { name: 'Delete division' })).toBeEnabled()
  })

  it('shows the refusal and only Close when bowlers are registered (D-151)', () => {
    show({ info: { registrationCount: 12, sweeperCount: 2 } })

    expect(dialog()).toHaveTextContent(
      '12 bowlers are registered in Women. Move them to another division first.',
    )
    expect(dialog()).not.toHaveTextContent('will be deleted')
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Delete division/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('uses the singular for one registered bowler (D-151)', () => {
    show({ info: { registrationCount: 1, sweeperCount: 0 } })

    expect(dialog()).toHaveTextContent(
      '1 bowler is registered in Women. Move them to another division first.',
    )
  })

  it('closes when Cancel is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    show({ info: { registrationCount: 0, sweeperCount: 0 }, onClose })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onConfirm when Delete is pressed', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    show({ info: { registrationCount: 0, sweeperCount: 0 }, onConfirm })

    await user.click(screen.getByRole('button', { name: 'Delete division' }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('shows Deleting… and turns both buttons off while the request runs', () => {
    show({ info: { registrationCount: 0, sweeperCount: 0 }, pending: true })

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('shows why a request failed as an alert', () => {
    show({ info: { registrationCount: 0, sweeperCount: 0 }, failure: 'Failed to delete (500)' })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to delete (500)')
  })
})
