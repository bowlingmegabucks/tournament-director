import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DateInput } from './DateInput'

function Harness({ start = '' }: Readonly<{ start?: string }>) {
  const [value, setValue] = useState(start)
  return (
    <>
      <label htmlFor="d">Day</label>
      <DateInput id="d" value={value} onValueChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  )
}

describe('DateInput', () => {
  it('moves from month to day to year when "/" is typed', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Day'), '3/5/2027')

    expect(screen.getByLabelText('Day')).toHaveValue('03/05/2027')
    expect(screen.getByTestId('value')).toHaveTextContent('2027-03-05')
  })

  it.each(['-', '.'])('accepts "%s" as the separator too', async (separator) => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Day'), `3${separator}5${separator}2027`)

    expect(screen.getByTestId('value')).toHaveTextContent('2027-03-05')
  })

  it('adds the slashes itself when two digits are typed', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Day'), '03122027')

    expect(screen.getByLabelText('Day')).toHaveValue('03/12/2027')
  })

  it('shows a stored ISO date as mm/dd/yyyy', () => {
    render(<Harness start="2027-03-12" />)

    expect(screen.getByLabelText('Day')).toHaveValue('03/12/2027')
  })

  it('lets Backspace remove the slash and the digit before it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const box = screen.getByLabelText('Day')

    await user.type(box, '03/')
    await user.keyboard('{Backspace}')
    expect(box).toHaveValue('03')
    await user.keyboard('{Backspace}')
    expect(box).toHaveValue('0')
  })

  it('keeps the text typed so far as the value until the date is complete', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Day'), '03/1')

    expect(screen.getByTestId('value')).toHaveTextContent('03/1')
  })

  it('is a numeric text box with a format hint, and passes other props on', () => {
    render(<Harness />)
    const box = screen.getByLabelText('Day')

    expect(box).toHaveAttribute('type', 'text')
    expect(box).toHaveAttribute('inputmode', 'numeric')
    expect(box).toHaveAttribute('placeholder', 'mm/dd/yyyy')
    expect(box).toHaveAttribute('autocomplete', 'off')
  })
})
