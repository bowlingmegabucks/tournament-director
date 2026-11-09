import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDivision, createEditInfo, createSquad, createSweeper } from '../../mocks/data'
import { emptyBowler } from './deskForm'
import { moneyOf, editChangesOf, storedBowlerOf, toEditRegistrationValues } from './editForm'
import { EditReviewStep } from './EditReviewStep'
import type { RegistrationValues } from './deskForm'

const handicap = createDivision({ name: 'Handicap' })
const scratch = createDivision({ name: 'Scratch' })
const morning = createSquad({ date: '2026-10-24T09:00:00', entryFee: 75 })
const afternoon = createSquad({ date: '2026-10-24T13:00:00', entryFee: 80 })
const noon = createSweeper({ date: '2026-10-24T12:00:00', entryFee: 20 })
const early = createSweeper({ date: '2026-10-25T08:00:00', entryFee: 0.1 })
const late = createSweeper({ date: '2026-10-25T20:00:00', entryFee: 0.2 })
const lists = { squads: [morning, afternoon], sweepers: [noon, early, late] }

const info = createEditInfo({
  registration: {
    divisionId: handicap.id,
    average: 182,
    squadIds: [morning.id],
    sweeperIds: [noon.id],
  },
})

interface Overrides {
  registration?: Partial<RegistrationValues>
  bowler?: Partial<typeof emptyBowler>
  info?: typeof info
  changed?: boolean
  removalConfirmed?: boolean
  onConfirmRemoval?: (confirmed: boolean) => void
}

function show(overrides: Overrides = {}) {
  const usedInfo = overrides.info ?? info
  const registration = {
    ...toEditRegistrationValues(usedInfo.registration),
    ...overrides.registration,
  }
  const stored = storedBowlerOf(usedInfo)
  const bowler = { ...stored, ...overrides.bowler }
  return render(
    <EditReviewStep
      name="Maria Gonzalez"
      info={usedInfo}
      registration={registration}
      divisions={[handicap, scratch]}
      bowlerChanges={editChangesOf(stored, bowler)}
      money={moneyOf({ info: usedInfo, registration, ...lists })}
      changed={overrides.changed ?? true}
      removalConfirmed={overrides.removalConfirmed ?? false}
      onConfirmRemoval={overrides.onConfirmRemoval ?? (() => undefined)}
    />,
  )
}

describe('EditReviewStep when nothing changed (EDR-03)', () => {
  it('says so and shows nothing else', () => {
    show({ changed: false })

    expect(screen.getByRole('heading', { name: 'Review changes', level: 3 })).toBeVisible()
    expect(screen.getByText(/No changes yet/)).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('Maria Gonzalez')).not.toBeInTheDocument()
  })
})

describe('EditReviewStep bowler changes (BWL-16, D-206)', () => {
  it('lists a changed field old against new, and one that had no value as "not set"', () => {
    show({
      bowler: { city: 'Boston', suffix: 'Jr' },
      info: createEditInfo({ bowler: { suffix: '' } }),
    })

    expect(screen.getByText('Changes to the bowler:')).toBeVisible()
    expect(screen.getByText('City: Worcester → Boston')).toBeVisible()
    expect(screen.getByText('Suffix: not set → Jr')).toBeVisible()
  })

  it('treats a stored value of spaces as "not set"', () => {
    show({
      bowler: { email: 'new@example.com' },
      info: createEditInfo({ bowler: { email: '   ' } }),
    })

    expect(screen.getByText('Email: not set → new@example.com')).toBeVisible()
  })

  it('shows an emptied box as cleared', () => {
    show({ bowler: { phoneNumber: '' } })

    expect(screen.getByText('Phone: 5085550142 → (cleared)')).toBeVisible()
  })

  it('has no bowler list when nothing about the bowler changed', () => {
    show({ registration: { squadIds: [morning.id, afternoon.id] } })

    expect(screen.queryByText('Changes to the bowler:')).not.toBeInTheDocument()
  })
})

describe('EditReviewStep registration changes (REG-15, REG-16, REG-17, REG-18)', () => {
  it('names the name', () => {
    show({ registration: { squadIds: [morning.id, afternoon.id] } })

    expect(screen.getByText('Maria Gonzalez')).toBeVisible()
  })

  it('says a division change moves, by name', () => {
    show({ registration: { divisionId: scratch.id } })

    expect(screen.getByText('Moves the registration from Handicap to Scratch.')).toBeVisible()
  })

  it('does not say it moves when the division stays', () => {
    show({ registration: { average: '175' } })

    expect(screen.queryByText(/Moves the registration/)).not.toBeInTheDocument()
  })

  it.each([
    ['a new number', '175', 'Average: 182 → 175'],
    ['a cleared box', '', 'Average: 182 → (cleared)'],
    ['a box of spaces', '  ', 'Average: 182 → (cleared)'],
  ])('shows the average for %s', (_name, typed, text) => {
    show({ registration: { average: typed } })

    expect(screen.getByText(text)).toBeVisible()
  })

  it('shows "not set" when the average had no value', () => {
    show({
      info: createEditInfo({
        registration: { average: null, squadIds: [morning.id], sweeperIds: [noon.id] },
      }),
      registration: { average: '190' },
    })

    expect(screen.getByText('Average: not set → 190')).toBeVisible()
  })

  it('does not list the average when it did not change, even with spaces around it', () => {
    show({ registration: { average: ' 182 ', squadIds: [morning.id, afternoon.id] } })

    expect(screen.queryByText(/^Average:/)).not.toBeInTheDocument()
  })

  it.each([
    [true, 'Super sweeper: turned on.'],
    [false, 'Super sweeper: turned off.'],
  ])('says super sweeper turned %s', (next, text) => {
    const was = createEditInfo({
      registration: { superSweeper: !next, squadIds: [morning.id], sweeperIds: [noon.id] },
    })

    show({ info: was, registration: { superSweeper: next } })

    expect(screen.getByText(text)).toBeVisible()
  })

  it('has no registration list when none of the three changed', () => {
    show({ registration: { squadIds: [morning.id, afternoon.id] } })

    expect(screen.queryByText(/Super sweeper:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Average:/)).not.toBeInTheDocument()
  })
})

describe('EditReviewStep money (EDR-03, D-207)', () => {
  it('lists what is collected, with kind, date, fee, and the total, and a net line', () => {
    show({
      registration: {
        squadIds: [morning.id, afternoon.id],
        sweeperIds: [noon, early, late].map((sweeper) => sweeper.id),
      },
    })

    const table = screen.getByRole('table', { name: 'What to collect for the added entries' })
    expect(
      within(table).getByRole('row', { name: 'Squad Sat 10/24/2026 1:00 PM $80.00' }),
    ).toBeVisible()
    expect(
      within(table).getByRole('row', { name: 'Sweeper Sun 10/25/2026 8:00 AM $0.10' }),
    ).toBeVisible()
    expect(
      within(table).getByRole('row', { name: 'Sweeper Sun 10/25/2026 8:00 PM $0.20' }),
    ).toBeVisible()
    // 80 + 0.10 + 0.20, added as cents.
    expect(within(table).getByRole('row', { name: 'To collect $80.30' })).toBeVisible()
    expect(screen.getByText('Net: collect $80.30.')).toBeVisible()
    expect(screen.getByText(/records a \$0 desk entry/)).toBeVisible()
  })

  it('lists what may be refunded, with the tick, and says which sessions it removes', () => {
    show({ registration: { squadIds: [afternoon.id], sweeperIds: [] } })

    const table = screen.getByRole('table', { name: 'Refund may be due (handled outside the app)' })
    expect(
      within(table).getByRole('row', { name: 'Squad Sat 10/24/2026 9:00 AM $75.00' }),
    ).toBeVisible()
    expect(
      within(table).getByRole('row', { name: 'Sweeper Sat 10/24/2026 12:00 PM $20.00' }),
    ).toBeVisible()
    expect(within(table).getByRole('row', { name: 'To refund $95.00' })).toBeVisible()
    expect(screen.getByText('Net: refund $15.00.')).toBeVisible()
    expect(
      screen.getByRole('checkbox', {
        name: 'I understand this removes squad Sat 10/24/2026 9:00 AM and sweeper Sat 10/24/2026 12:00 PM from the registration and frees the lane.',
      }),
    ).toBeVisible()
  })

  it('shows the tick as it is, and reports a click', async () => {
    const onConfirmRemoval = vi.fn()
    const user = userEvent.setup()
    const { rerender } = show({
      registration: { sweeperIds: [] },
      removalConfirmed: false,
      onConfirmRemoval,
    })
    expect(screen.getByRole('checkbox', { name: /I understand/ })).not.toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: /I understand/ }))
    expect(onConfirmRemoval).toHaveBeenCalledWith(true)
    rerender(<div />)
    show({ registration: { sweeperIds: [] }, removalConfirmed: true })
    expect(screen.getAllByRole('checkbox', { name: /I understand/ }).at(-1)).toBeChecked()
  })

  it('has no tick and no collect hint for an addition only', () => {
    show({ registration: { squadIds: [morning.id, afternoon.id] } })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Refund/ })).not.toBeInTheDocument()
    expect(screen.getByText(/does not track payments/)).toBeVisible()
  })

  it('has no collect table and no collect hint for a removal only', () => {
    show({ registration: { sweeperIds: [] } })

    expect(screen.queryByRole('table', { name: /What to collect/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/does not track payments/)).not.toBeInTheDocument()
  })

  it('has no money lines and no net when only the division changes', () => {
    show({ registration: { divisionId: scratch.id } })

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Net:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('says even for a switch between two squads that cost the same', () => {
    const same = createSquad({ date: '2026-10-26T09:00:00', entryFee: 75 })
    const usedInfo = createEditInfo({
      registration: { squadIds: [morning.id], sweeperIds: [], divisionId: handicap.id },
    })
    const registration = { ...toEditRegistrationValues(usedInfo.registration), squadIds: [same.id] }

    render(
      <EditReviewStep
        name="Maria Gonzalez"
        info={usedInfo}
        registration={registration}
        divisions={[handicap]}
        bowlerChanges={[]}
        money={moneyOf({ info: usedInfo, registration, squads: [morning, same], sweepers: [] })}
        changed
        removalConfirmed={false}
        onConfirmRemoval={() => undefined}
      />,
    )

    expect(screen.getByText('Net: even. Nothing to collect or refund.')).toBeVisible()
  })
})
