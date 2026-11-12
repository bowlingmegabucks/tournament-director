import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BowlerFields } from './BowlerFields'
import { emptyBowler } from './deskForm'
import type { BowlerValues, DeskFieldErrors } from './types'

function show(values: Partial<BowlerValues> = {}, errors: DeskFieldErrors = {}, hint?: string) {
  const onChange = vi.fn()
  render(
    <BowlerFields
      values={{ ...emptyBowler, ...values }}
      errors={errors}
      legend="Bowler details"
      hint={hint}
      onChange={onChange}
    />,
  )
  return { onChange, user: userEvent.setup() }
}

describe('BowlerFields (BWL-01 to BWL-10, D-162)', () => {
  it('groups the boxes under the legend, with the names marked required', () => {
    show()

    expect(screen.getByRole('group', { name: 'Bowler details' })).toBeVisible()
    expect(screen.getByLabelText('First name (required)')).toBeVisible()
    expect(screen.getByLabelText('Last name (required)')).toBeVisible()
    expect(screen.getByLabelText('State (2 letters)')).toHaveAttribute('maxlength', '2')
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Phone')).toHaveAttribute('type', 'tel')
  })

  it('shows the values it is given', () => {
    show({ firstName: 'Maria', gender: 'Female' })

    expect(screen.getByLabelText('First name (required)')).toHaveValue('Maria')
    expect(screen.getByLabelText('Gender')).toHaveValue('Female')
  })

  it('reports each typed change with its key', async () => {
    const { onChange, user } = show()

    await user.type(screen.getByLabelText('City'), 'W')
    await user.selectOptions(screen.getByLabelText('Gender'), 'Male')

    expect(onChange).toHaveBeenCalledWith('city', 'W')
    expect(onChange).toHaveBeenCalledWith('gender', 'Male')
  })

  it('shows the hint, and the USBC ID hint ties to its box', () => {
    show({}, {}, 'Fill what you know.')

    expect(screen.getByText('Fill what you know.')).toBeVisible()
    expect(screen.getByLabelText('USBC ID')).toHaveAccessibleDescription(/Like 1234-56789/)
  })

  it('links an error to its box and marks the box invalid', () => {
    show({}, { 'bowler.email': 'Enter a valid email.' })

    const email = screen.getByLabelText('Email')
    expect(email).toBeInvalid()
    expect(email).toHaveAccessibleDescription('Enter a valid email.')
    expect(screen.getByLabelText('City')).toBeValid()
  })

  it('marks the gender box invalid with its message', () => {
    show({}, { 'bowler.gender': 'Pick one.' })

    const gender = screen.getByLabelText('Gender')
    expect(gender).toBeInvalid()
    expect(gender).toHaveAccessibleDescription('Pick one.')
  })

  it('types the date of birth as mm/dd/yyyy and reports ISO once it is whole', () => {
    const { onChange } = show()
    const box = screen.getByLabelText('Date of birth')

    fireEvent.change(box, { target: { value: '4/' } })
    expect(onChange).toHaveBeenLastCalledWith('dateOfBirth', '04/')
    fireEvent.change(box, { target: { value: '4/1/1975' } })
    expect(onChange).toHaveBeenLastCalledWith('dateOfBirth', '1975-04-01')
    expect(box).toHaveAttribute('placeholder', 'mm/dd/yyyy')
  })

  it('shows a stored date of birth as mm/dd/yyyy', () => {
    show({ dateOfBirth: '1975-04-01' })

    expect(screen.getByLabelText('Date of birth')).toHaveValue('04/01/1975')
  })

  it('links an error to the date of birth box and marks it invalid', () => {
    show({ dateOfBirth: '04/0' }, { 'bowler.dateOfBirth': 'Enter the date of birth as mm/dd/yyyy' })

    const box = screen.getByLabelText('Date of birth')
    expect(box).toBeInvalid()
    expect(box).toHaveAccessibleDescription('Enter the date of birth as mm/dd/yyyy')
  })

  it('describes a box with nothing only when it has an error or a hint', () => {
    show()

    expect(screen.getByLabelText('Date of birth')).not.toHaveAttribute('aria-describedby')
    expect(screen.getByLabelText('Date of birth')).not.toBeInvalid()
    expect(screen.getByLabelText('City')).not.toHaveAttribute('aria-describedby')
    expect(screen.getByLabelText('USBC ID')).toHaveAttribute('aria-describedby')
  })

  it('turns browser autofill off, and gives the Zip box its short label', () => {
    show()

    for (const label of ['Street', 'City', 'Zip', 'Date of birth']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off')
    }
  })

  it('lists an error before the hint in the description', () => {
    show({}, { 'bowler.usbcId': 'USBC ID is wrong.' })

    expect(screen.getByLabelText('USBC ID')).toHaveAccessibleDescription(
      /^USBC ID is wrong\. Like 1234-56789/,
    )
  })
})
