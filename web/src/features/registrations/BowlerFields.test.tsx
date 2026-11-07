import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
