/**
 * Payout amounts typed in the entry sheet (PAY-07, D-270). The same rules and words as the API's
 * `money.ts`, so a mistake shows next to the box before the save; the API checks again.
 */

export const maxCents = 9_999_999
export const needsAmountMessage = 'Enter an amount above $0.00'
export const tooMuchMessage = 'The most you can enter is $99,999.99'
export const badAmountMessage = 'Enter dollars and cents, like 100.00'

export type ParsedAmount =
  { kind: 'blank' } | { kind: 'amount'; cents: number } | { kind: 'invalid'; message: string }

/** Read what a director typed. A blank means no payout. `$` and thousands commas are allowed. */
export function parseAmount(input: string): ParsedAmount {
  const text = input.trim()
  if (text === '') return { kind: 'blank' }
  const plain = text.replace(/^\$/, '').replaceAll(',', '')
  if (/^-\d+(\.\d{1,2})?$/.test(plain)) return { kind: 'invalid', message: needsAmountMessage }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(plain)
  if (!match) return { kind: 'invalid', message: badAmountMessage }
  const whole = match[1] ?? '0'
  if (whole.length > 7) return { kind: 'invalid', message: tooMuchMessage }
  const cents = Number(whole) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (cents <= 0) return { kind: 'invalid', message: needsAmountMessage }
  if (cents > maxCents) return { kind: 'invalid', message: tooMuchMessage }
  return { kind: 'amount', cents }
}

/** `12345` as `"123.45"`. */
export function formatCents(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}
