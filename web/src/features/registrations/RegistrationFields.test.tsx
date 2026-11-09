import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDivision, createSquad, createSweeper } from '../../mocks/data'
import { emptyRegistration, type RegistrationValues } from './deskForm'
import { RegistrationFields } from './RegistrationFields'

const first = createDivision({ number: 1, name: 'Scratch' })
const second = createDivision({ number: 2, name: 'Handicap' })
const morning = createSquad({ date: '2026-10-24T09:00:00' })
const afternoon = createSquad({ date: '2026-10-24T13:00:00' })
const finished = createSquad({ date: '2026-10-23T09:00:00', complete: true })
const sweeper = createSweeper({ date: '2026-10-24T12:00:00' })

function show(
  props: Partial<Parameters<typeof RegistrationFields>[0]> = {},
  values: Partial<RegistrationValues> = {},
) {
  const onChange = vi.fn()
  render(
    <RegistrationFields
      values={{ ...emptyRegistration, ...values }}
      errors={{}}
      divisions={[second, first]}
      squads={[morning, afternoon, finished]}
      sweepers={[sweeper]}
      heldSquadIds={[]}
      heldSweeperIds={[]}
      presetSquadId={undefined}
      presetSweeperId={undefined}
      legend="Registration"
      onChange={onChange}
      {...props}
    />,
  )
  return onChange
}

describe('RegistrationFields (REG-03, REG-04, REG-06, REG-16)', () => {
  it('lists the divisions by number, after a prompt', () => {
    show()

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options.slice(0, 3)).toEqual(['Pick a division', 'Scratch', 'Handicap'])
  })

  it('shows the hint under the legend, and none when there is none', () => {
    show({ hint: 'Held squads are locked.' })

    expect(screen.getByText('Held squads are locked.')).toBeVisible()
  })

  it('shows no hint paragraph without one', () => {
    show()

    expect(screen.queryByText('Held squads are locked.')).not.toBeInTheDocument()
    expect(document.querySelectorAll('fieldset > p')).toHaveLength(0)
  })

  it('says when a tournament has no sweepers', () => {
    show({ sweepers: [] })

    expect(screen.getByText('None in this tournament.')).toBeVisible()
  })

  it('does not say it when there are sessions', () => {
    show()

    expect(screen.queryByText('None in this tournament.')).not.toBeInTheDocument()
  })

  it('ties a division error to its select, and marks it invalid', () => {
    show({ errors: { divisionId: 'Pick a division' } })

    const select = screen.getByLabelText('Division (required)')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Pick a division')
  })

  it('leaves the division select valid with no error', () => {
    show()

    const select = screen.getByLabelText('Division (required)')
    expect(select).not.toHaveAttribute('aria-invalid')
    expect(select).not.toHaveAttribute('aria-describedby')
  })

  it('describes the average with its hint, and with its error when it has one', () => {
    show()
    expect(screen.getByLabelText('Average')).toHaveAccessibleDescription(
      '1 to 300. Handicap and some divisions need it.',
    )
    expect(screen.getByLabelText('Average')).not.toHaveAttribute('aria-invalid')
  })

  it('shows an average error and marks the box invalid', () => {
    show({ errors: { average: 'Average must be greater than 0.' } })

    const box = screen.getByLabelText('Average')
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription('Average must be greater than 0.')
  })

  it('shows a squad error on its group, and a sweeper error on its own', () => {
    show({
      errors: {
        squadIds: 'Bowler must enter at least one squad',
        sweeperIds: 'Invalid sweeper IDs',
      },
    })

    expect(
      screen.getByRole('group', { name: 'Squads (pick at least one)' }),
    ).toHaveAccessibleDescription('Bowler must enter at least one squad')
    expect(screen.getByRole('group', { name: 'Sweepers' })).toHaveAccessibleDescription(
      'Invalid sweeper IDs',
    )
  })

  it('shows a super sweeper error as an alert', () => {
    show({ errors: { superSweeper: 'Must enter all sweepers to enter Super Sweeper' } })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Must enter all sweepers to enter Super Sweeper',
    )
  })

  it('shows no alert without that error', () => {
    show()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a picked division, a typed average, and the super sweeper', async () => {
    const onChange = show()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByLabelText('Division (required)'), 'Handicap')
    await user.type(screen.getByLabelText('Average'), '1')
    await user.click(screen.getByLabelText('Super sweeper', { exact: false }))

    expect(onChange).toHaveBeenNthCalledWith(1, { ...emptyRegistration, divisionId: second.id })
    expect(onChange).toHaveBeenNthCalledWith(2, { ...emptyRegistration, average: '1' })
    expect(onChange).toHaveBeenNthCalledWith(3, { ...emptyRegistration, superSweeper: true })
  })

  it('adds a ticked squad once, keeping the others', async () => {
    const onChange = show({}, { squadIds: [afternoon.id] })
    const user = userEvent.setup()

    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))

    expect(onChange).toHaveBeenCalledWith({
      ...emptyRegistration,
      squadIds: [afternoon.id, morning.id],
    })
  })

  it('removes an unticked squad and keeps the others', async () => {
    const onChange = show({}, { squadIds: [morning.id, afternoon.id] })
    const user = userEvent.setup()

    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/))

    expect(onChange).toHaveBeenCalledWith({ ...emptyRegistration, squadIds: [afternoon.id] })
  })

  it('toggles a sweeper', async () => {
    const onChange = show()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText(/Sat 10\/24\/2026 12:00 PM/))

    expect(onChange).toHaveBeenCalledWith({ ...emptyRegistration, sweeperIds: [sweeper.id] })
  })

  it('locks and badges a held squad, and a squad from the lane page', () => {
    show({ heldSquadIds: [morning.id], presetSquadId: afternoon.id })

    expect(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/)).toBeChecked()
    expect(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/)).toBeDisabled()
    expect(screen.getByText('Already entered')).toBeVisible()
    expect(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/)).toBeChecked()
    expect(screen.getByLabelText(/Sat 10\/24\/2026 1:00 PM/)).toBeDisabled()
    expect(screen.getByText('Added from the lane page')).toBeVisible()
  })

  it('shows only the held badge when a squad is both held and from the lane page', () => {
    show({ heldSquadIds: [morning.id], presetSquadId: morning.id })

    expect(screen.getByText('Already entered')).toBeVisible()
    expect(screen.queryByText('Added from the lane page')).not.toBeInTheDocument()
  })

  it('greys a complete squad and badges it, but not a complete one the bowler already holds', () => {
    show()
    expect(screen.getByLabelText(/Fri 10\/23\/2026 9:00 AM/)).toBeDisabled()
    expect(screen.getByLabelText(/Fri 10\/23\/2026 9:00 AM/)).not.toBeChecked()
    expect(screen.getByText('Complete')).toBeVisible()
  })

  it('shows a held complete squad as entered, not as complete', () => {
    show({ heldSquadIds: [finished.id] })

    expect(screen.getByText('Already entered')).toBeVisible()
    expect(screen.queryByText('Complete')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Fri 10\/23\/2026 9:00 AM/)).toBeChecked()
  })

  it('leaves an open squad enabled and unchecked', () => {
    show()

    expect(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/)).toBeEnabled()
    expect(screen.getByLabelText(/Sat 10\/24\/2026 9:00 AM/)).not.toBeChecked()
  })
})
