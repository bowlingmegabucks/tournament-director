/**
 * Payout money (PAY-07, D-270). Dollars in and out are text with two decimals (`"100.00"`); inside
 * the code an amount is whole cents, so no float ever holds money.
 */

export const maxCents = 9_999_999

export const needsAmountMessage = 'Enter an amount above $0.00'
export const tooMuchMessage = 'The most you can enter is $99,999.99'
export const badAmountMessage = 'Enter dollars and cents, like 100.00'

export type ParsedAmount =
  { kind: 'blank' } | { kind: 'amount'; cents: number } | { kind: 'invalid'; message: string }

/**
 * Read what a director typed. A blank (or `null`) means no payout. A `$` and thousands commas (in
 * groups of three) are allowed; more than two decimals, letters, and a minus sign are not. A number is read through its
 * text, so `100.005` is refused instead of rounded.
 */
export function parseAmount(input: unknown): ParsedAmount {
  if (input === null || input === undefined) return { kind: 'blank' }
  if (typeof input !== 'string' && typeof input !== 'number') {
    return { kind: 'invalid', message: badAmountMessage }
  }
  const text = (typeof input === 'number' ? String(input) : input).trim()
  if (text === '') return { kind: 'blank' }
  const unsigned = text.replace(/^\$/, '')
  // A comma is a thousands mark only in groups of three: `1,50` is a slip, not $150.
  if (unsigned.includes(',') && !/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(unsigned)) {
    return { kind: 'invalid', message: badAmountMessage }
  }
  const plain = unsigned.replaceAll(',', '')
  if (/^-\d+(\.\d{1,2})?$/.test(plain)) {
    return { kind: 'invalid', message: needsAmountMessage }
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(plain)
  if (!match) return { kind: 'invalid', message: badAmountMessage }
  const dollars = match[1] ?? '0'
  // Many digits would lose precision as a number; they are over the limit anyway.
  if (dollars.length > 7) return { kind: 'invalid', message: tooMuchMessage }
  const cents = Number(dollars) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (cents <= 0) return { kind: 'invalid', message: needsAmountMessage }
  if (cents > maxCents) return { kind: 'invalid', message: tooMuchMessage }
  return { kind: 'amount', cents }
}

/** `12345` becomes `"123.45"`. */
export function formatCents(cents: number): string {
  const whole = Math.trunc(cents / 100)
  const part = String(Math.abs(cents % 100)).padStart(2, '0')
  return `${whole}.${part}`
}

/** The cents of a stored decimal text such as `"100.00"` or `"100"`. */
export function centsFromText(text: string): number {
  const [whole = '0', part = ''] = text.split('.')
  return Number(whole) * 100 + Number(part.padEnd(2, '0').slice(0, 2))
}
