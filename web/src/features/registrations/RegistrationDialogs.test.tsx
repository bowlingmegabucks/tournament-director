import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlreadyRegisteredDialog, UsbcIdOnFileDialog } from './RegistrationDialogs'

const existing = {
  registrationId: 'r1',
  divisionId: 'd1',
  divisionName: 'Scratch',
  squadIds: [],
  sweeperIds: [],
  average: null,
  superSweeper: false,
  hasScores: false,
}

function openAlready(overrides: Partial<Parameters<typeof AlreadyRegisteredDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <AlreadyRegisteredDialog
      name="Maria Gonzalez"
      existing={existing}
      adding={[
        { id: 'a', label: 'Sat 1:00 PM squad' },
        { id: 'b', label: 'Sat 1:00 PM squad' },
        { id: 'c', label: 'Sweeper' },
      ]}
      pending={false}
      failure={undefined}
      onConfirm={onConfirm}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onConfirm, onClose, user: userEvent.setup() }
}

describe('AlreadyRegisteredDialog (D-159, D-165)', () => {
  it('names the bowler and division, and lists what would be added', () => {
    openAlready()

    expect(screen.getByRole('dialog', { name: 'Already registered' })).toBeVisible()
    expect(screen.getByText(/Maria Gonzalez is already registered/)).toHaveTextContent('Scratch')
    // Two squads at one minute read the same and still list twice.
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Sat 1:00 PM squad',
      'Sat 1:00 PM squad',
      'Sweeper',
    ])
  })

  it('confirms with Yes and closes with No, go back', async () => {
    const { onConfirm, onClose, user } = openAlready()

    await user.click(screen.getByRole('button', { name: 'Yes, add to registration' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'No, go back' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('says Saving… and disables both buttons while the save runs', () => {
    openAlready({ pending: true })

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'No, go back' })).toBeDisabled()
  })

  it('shows a failure as an alert, and none otherwise', () => {
    openAlready({ failure: 'Could not save.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.')
  })

  it('shows no alert without a failure', () => {
    openAlready()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('UsbcIdOnFileDialog (D-161)', () => {
  function openUsbc() {
    const onUse = vi.fn()
    const onClose = vi.fn()
    render(
      <UsbcIdOnFileDialog
        stored={{ id: 'b1', name: 'Maria Gonzalez' }}
        usbcId="1234-56789"
        onUse={onUse}
        onClose={onClose}
      />,
    )
    return { onUse, onClose, user: userEvent.setup() }
  }

  it('shows the stored bowler and the ID', () => {
    openUsbc()

    expect(
      screen.getByRole('dialog', { name: 'A bowler with this USBC ID is on file' }),
    ).toBeVisible()
    expect(screen.getByText('Maria Gonzalez')).toBeVisible()
    expect(screen.getByText(/1234-56789/)).toBeVisible()
  })

  it('uses the bowler on Yes and closes on No', async () => {
    const { onUse, onClose, user } = openUsbc()

    await user.click(screen.getByRole('button', { name: 'Yes, use this bowler' }))
    expect(onUse).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'No, change the USBC ID' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
