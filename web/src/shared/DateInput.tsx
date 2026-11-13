import type { InputHTMLAttributes } from 'react'
import { displayDate, valueOfText } from './dateText'

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** `YYYY-MM-DD` once the date is complete, else what was typed. */
  value: string
  onValueChange: (value: string) => void
}

/**
 * A date typed as `mm/dd/yyyy`. "/" (or "-", ".", a space) moves on to the day and year, which a
 * native date box cannot do in every browser. The value is `YYYY-MM-DD` once it is complete.
 */
export function DateInput({ value, onValueChange, ...rest }: Readonly<DateInputProps>) {
  const shown = displayDate(value)
  return (
    <input
      autoComplete="off"
      placeholder="mm/dd/yyyy"
      {...rest}
      type="text"
      inputMode="numeric"
      value={shown}
      onChange={(event) => {
        const text = event.target.value
        onValueChange(valueOfText(text, text.length < shown.length))
      }}
    />
  )
}
