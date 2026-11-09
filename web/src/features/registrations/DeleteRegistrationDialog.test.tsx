import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDeleteInfo } from '../../mocks/data'
import {
  completeMessage,
  DeleteRegistrationDialog,
  scoresMessage,
} from './DeleteRegistrationDialog'
import type { DeleteInfo } from './types'

const paidInfo = (overrides: Partial<DeleteInfo> = {}) =>
  createDeleteInfo({
    payments: [{ system: 'BowlingSite', amount: 85 }],
    paidTotal: 85,
    ...overrides,
  })

function show(
  props: {
    info?: DeleteInfo
    loading?: boolean
    loadFailure?: string
    pending?: boolean
    failure?: string
    onConfirm?: (confirmPaid: number | undefined) => void
    onRetry?: () => void
  } = {},
) {
  return render(
    <DeleteRegistrationDialog
      bowlerName="Maria Gonzalez"
      info={props.info}
      loading={props.loading ?? false}
      loadFailure={props.loadFailure}
      onRetry={props.onRetry ?? (() => undefined)}
      pending={props.pending ?? false}
      failure={props.failure}
      onConfirm={props.onConfirm ?? (() => undefined)}
      onClose={() => undefined}
    />,
  )
}

const dialog = () => screen.getByRole('dialog', { name: "Delete Maria Gonzalez's registration?" })
const deleteButton = () => within(dialog()).getByRole('button', { name: 'Delete registration' })

describe('while it loads or when the read fails (D-212)', () => {
  it('shows Loading and keeps Delete off', () => {
    show({ loading: true })

    expect(within(dialog()).getByText('Loading registration…')).toBeVisible()
    expect(deleteButton()).toBeDisabled()
  })

  it('shows the failure with Try again and keeps Delete off', async () => {
    const onRetry = vi.fn()
    show({ loadFailure: 'Failed to load the registration (500)', onRetry })

    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'Failed to load the registration (500)',
    )
    expect(deleteButton()).toBeDisabled()
    await userEvent.setup().click(within(dialog()).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('no real payment (REG-19, D-212, D-213)', () => {
  it('asks the legacy question and lists each entry with its fee and a total', () => {
    show({ info: createDeleteInfo() })

    const view = within(dialog())
    expect(
      view.getByText(/Are you sure you want to delete this bowler's entire registration\?/),
    ).toBeVisible()
    expect(view.getByText('Refund may be due, handled outside the app')).toBeVisible()
    expect(
      view.getByRole('row', { name: /Squad, Sat 10\/24\/2026 9:00 AM \$60\.00/ }),
    ).toBeVisible()
    expect(
      view.getByRole('row', { name: /Sweeper, Sat 10\/24\/2026 6:00 PM \$25\.00/ }),
    ).toBeVisible()
    expect(view.getByRole('row', { name: 'Total $85.00' })).toBeVisible()
    expect(view.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('has Cancel and an enabled Delete that sends no total (D-213)', async () => {
    const onConfirm = vi.fn()
    show({ info: createDeleteInfo(), onConfirm })

    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeEnabled()
    await userEvent.setup().click(deleteButton())

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('leaves out the fee table for a registration with no entries', () => {
    show({ info: createDeleteInfo({ entries: [], entriesTotal: 0 }) })

    expect(within(dialog()).queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('a real payment (D-210, D-212, D-213)', () => {
  it('shows what was paid and the system, never a code, and asks for a tick', () => {
    show({ info: paidInfo() })

    const view = within(dialog())
    expect(view.getByRole('alert')).toHaveTextContent(
      'Paid outside this system: $85.00 (BowlingSite, 1 payment). Deleting the registration removes the payment records. Any refund is handled outside the app.',
    )
    expect(view.getByRole('row', { name: 'Entries total $85.00' })).toBeVisible()
    expect(
      view.getByRole('checkbox', {
        name: 'I know this bowler paid outside this system and any refund is handled outside the app.',
      }),
    ).not.toBeChecked()
    expect(deleteButton()).toBeDisabled()
  })

  it('names two payments, each system once', () => {
    show({
      info: paidInfo({
        payments: [
          { system: 'BowlingSite', amount: 60 },
          { system: 'BowlingSite', amount: 25 },
          { system: 'Cash', amount: 10 },
        ],
        paidTotal: 95,
      }),
    })

    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      '$95.00 (BowlingSite, Cash, 3 payments)',
    )
  })

  it('turns Delete on with the tick and sends the total that was shown', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    show({ info: paidInfo(), onConfirm })

    await user.click(within(dialog()).getByRole('checkbox'))
    expect(deleteButton()).toBeEnabled()
    await user.click(deleteButton())

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(85)
  })

  it('turns Delete off again when the tick is cleared', async () => {
    const user = userEvent.setup()
    show({ info: paidInfo() })

    await user.click(within(dialog()).getByRole('checkbox'))
    await user.click(within(dialog()).getByRole('checkbox'))

    expect(deleteButton()).toBeDisabled()
  })

  it('clears the tick when the total changes (D-213)', async () => {
    const user = userEvent.setup()
    const view = show({ info: paidInfo() })
    await user.click(within(dialog()).getByRole('checkbox'))

    view.rerender(
      <DeleteRegistrationDialog
        bowlerName="Maria Gonzalez"
        info={paidInfo({ payments: [{ system: 'BowlingSite', amount: 145 }], paidTotal: 145 })}
        loading={false}
        onRetry={() => undefined}
        pending={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(within(dialog()).getByRole('checkbox')).not.toBeChecked()
    expect(deleteButton()).toBeDisabled()
  })
})

describe('refusals (REG-19, D-211)', () => {
  it('says scores are saved and offers only Close', () => {
    show({ info: createDeleteInfo({ hasScores: true }) })

    const view = within(dialog())
    expect(view.getByRole('alert')).toHaveTextContent(scoresMessage)
    expect(view.getByRole('button', { name: 'Close' })).toBeEnabled()
    expect(view.queryByRole('button', { name: 'Delete registration' })).not.toBeInTheDocument()
    expect(view.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says a complete tournament freezes it, and lists both reasons together', () => {
    show({ info: createDeleteInfo({ tournamentComplete: true, hasScores: true }) })

    const view = within(dialog())
    expect(view.getByText(completeMessage)).toBeVisible()
    expect(view.getByText(scoresMessage)).toBeVisible()
  })

  it('keeps Delete out of a refused paid registration even with a tick', () => {
    show({ info: paidInfo({ hasScores: true }) })

    expect(within(dialog()).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Delete registration' })).toBeNull()
  })
})

describe('saving (D-213)', () => {
  it('shows Deleting… and disables both buttons while the request runs', () => {
    show({ info: createDeleteInfo(), pending: true })

    expect(within(dialog()).getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('shows why the request failed', () => {
    show({ info: createDeleteInfo(), failure: 'Failed to delete the registration (503)' })

    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'Failed to delete the registration (503)',
    )
  })
})
