import type { FocusEvent } from 'react'
import { DateInput } from './DateInput'
import styles from './DateTimeInput.module.css'

interface DateTimeInputProps {
  id: string
  name: string
  /** `YYYY-MM-DDTHH:mm`. Until both parts are complete it holds what was typed. */
  value: string
  onValueChange: (value: string) => void
  /** Called when focus leaves both boxes, not when it moves from one to the other. */
  onBlur: () => void
  inputClassName: string
  readOnly?: boolean
  invalid?: boolean
  describedBy?: string
  /** `YYYY-MM-DD`, the first day allowed. Only a hook for browser tests: the check is in the form. */
  firstDay?: string
}

function split(value: string): [string, string] {
  const at = value.indexOf('T')
  return at < 0 ? [value, ''] : [value.slice(0, at), value.slice(at + 1)]
}

/** The form's date and time in two boxes: the date as text (see `DateInput`) and a time box. */
export function DateTimeInput({
  id,
  name,
  value,
  onValueChange,
  onBlur,
  inputClassName,
  readOnly = false,
  invalid = false,
  describedBy,
  firstDay,
}: Readonly<DateTimeInputProps>) {
  const [date, time] = split(value)
  const join = (nextDate: string, nextTime: string) =>
    nextTime === '' ? nextDate : `${nextDate}T${nextTime}`

  function leave(event: FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return
    }
    onBlur()
  }

  return (
    <div className={styles.row} onBlur={leave}>
      <DateInput
        className={inputClassName}
        id={id}
        name={name}
        value={date}
        readOnly={readOnly}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        data-first-day={firstDay}
        onValueChange={(next) => {
          onValueChange(join(next, time))
        }}
      />
      <input
        className={inputClassName}
        name={`${name}Time`}
        type="time"
        aria-label="Time"
        value={time}
        readOnly={readOnly}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          onValueChange(join(date, event.target.value))
        }}
      />
    </div>
  )
}
