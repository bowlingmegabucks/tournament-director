import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateTimeInput } from './DateTimeInput'

function Harness({
  start = '',
  onBlur = () => undefined,
  readOnly,
  invalid,
}: Readonly<{ start?: string; onBlur?: () => void; readOnly?: boolean; invalid?: boolean }>) {
  const [value, setValue] = useState(start)
  return (
    <>
      <label htmlFor="when">When</label>
      <DateTimeInput
        id="when"
        name="when"
        inputClassName="box"
        value={value}
        onValueChange={setValue}
        onBlur={onBlur}
        readOnly={readOnly}
        invalid={invalid}
        describedBy="note"
      />
      <output data-testid="value">{value}</output>
      <button type="button">After</button>
    </>
  )
}

describe('DateTimeInput', () => {
  it('splits a stored value into a date box and a time box', () => {
    render(<Harness start="2026-10-24T09:30" />)

    expect(screen.getByLabelText('When')).toHaveValue('10/24/2026')
    expect(screen.getByLabelText('Time')).toHaveValue('09:30')
  })

  it('joins a typed date and a time into one value', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('When'), '10/24/2026')
    expect(screen.getByTestId('value')).toHaveTextContent(/^2026-10-24$/)
    await user.type(screen.getByLabelText('Time'), '0930AM')

    expect(screen.getByTestId('value')).toHaveTextContent('2026-10-24T09:30')
  })

  it('keeps a typed time while the date is still partial', async () => {
    const user = userEvent.setup()
    render(<Harness start="T09:30" />)

    await user.type(screen.getByLabelText('When'), '10/2')

    expect(screen.getByTestId('value')).toHaveTextContent('10/2T09:30')
    expect(screen.getByLabelText('Time')).toHaveValue('09:30')
  })

  it('does not report a blur when focus moves from the date to the time', async () => {
    const user = userEvent.setup()
    const onBlur = vi.fn()
    render(<Harness onBlur={onBlur} />)

    await user.click(screen.getByLabelText('When'))
    await user.tab()
    expect(screen.getByLabelText('Time')).toHaveFocus()
    expect(onBlur).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'After' }))
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('marks both boxes read-only, invalid, and described when told to', () => {
    render(<Harness readOnly invalid />)

    for (const box of [screen.getByLabelText('When'), screen.getByLabelText('Time')]) {
      expect(box).toHaveAttribute('readonly')
      expect(box).toHaveAttribute('aria-invalid', 'true')
      expect(box).toHaveAttribute('aria-describedby', 'note')
    }
  })

  it('leaves the boxes valid and editable by default', () => {
    render(<Harness />)

    expect(screen.getByLabelText('When')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('When')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Time')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Time')).not.toHaveAttribute('aria-invalid')
  })

  it('names the boxes so a form post could tell them apart', () => {
    render(<Harness />)

    expect(screen.getByLabelText('When')).toHaveAttribute('name', 'when')
    expect(screen.getByLabelText('Time')).toHaveAttribute('name', 'whenTime')
  })
})
