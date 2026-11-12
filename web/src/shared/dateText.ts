/**
 * The text of a date box. The director types `mm/dd/yyyy`; the form keeps `YYYY-MM-DD` once the
 * date is complete, and the typed text until then (so the box shows what was typed and the
 * form's check says the date is not valid yet).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SEPARATOR = /[/\-.\s]/

/** `YYYY-MM-DD` to `mm/dd/yyyy`; any other text stays as it is. */
export function displayDate(value: string): string {
  return ISO_DATE.test(value)
    ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`
    : value
}

/** `mm/dd/yyyy` to `YYYY-MM-DD`, or `undefined` while the text is not a full date. */
function isoOfDisplay(text: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  return match ? `${match[3]}-${match[1]}-${match[2]}` : undefined
}

/** Whether the part at `index` (month, day, year) takes no more digits. */
function isFull(parts: readonly string[], index: number): boolean {
  const part = parts[index] ?? ''
  if (index === 2) return part.length === 4
  // A first digit that cannot start a two-digit month (2 to 9) or day (4 to 9) ends the part.
  return part.length === 2 || (part.length === 1 && Number(part) > (index === 0 ? 1 : 3))
}

/**
 * The box text after an edit. Digits fill month, day, and year in turn, and "/" follows a full
 * part. "/", "-", ".", or a space ends the part being typed and pads one digit ("3/" is "03/").
 * `deleting` is true when the text got shorter: the trailing "/" stays off, so Backspace is not
 * undone. A typed or pasted `YYYY-MM-DD` is read as it is.
 */
export function formatTypedDate(text: string, deleting = false): string {
  if (ISO_DATE.test(text.trim())) return text.trim()
  const parts = ['']
  let closed = false
  for (const char of text) {
    if (/\d/.test(char)) {
      if (closed) {
        if (parts.length === 3) continue
        parts.push('')
      }
      parts[parts.length - 1] += char
      closed = isFull(parts, parts.length - 1)
    } else if (SEPARATOR.test(char) && parts.length < 3 && parts[parts.length - 1] !== '') {
      closed = true
    }
  }
  const last = parts.length - 1
  const text2 = parts.map((part, index) => (closed || index < last ? part.padStart(2, '0') : part))
  const body = text2.join('/')
  return closed && last < 2 && !deleting ? `${body}/` : body
}

/** The form value for the text in the box: ISO when the date is complete, else the text. */
export function valueOfText(text: string, deleting = false): string {
  const formatted = formatTypedDate(text, deleting)
  return isoOfDisplay(formatted) ?? formatted
}
