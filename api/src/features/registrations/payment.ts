import { manualPrefix } from '../tournaments/prismaDeleteFacts.ts'
import type { PaymentInput } from './request.ts'
import type { NewPayment } from './writer.ts'

/**
 * D-106: a request is *paid* when it carries a payment that is not the `Manual` placeholder and
 * has an amount above 0. `Manual` is an exact match, as in legacy. The registration site always pays first; the desk sends a `Manual_` $0
 * entry (PAY-01a). A paid request gets the legacy rules; any other request gets the desk rules.
 */
export function isPaidRequest(payment: PaymentInput | null | undefined): boolean {
  return (
    payment !== null &&
    payment !== undefined &&
    payment.processingSystem !== 'Manual' &&
    // The column keeps cents, so an amount that rounds to $0.00 is not a payment.
    Math.round(payment.amount * 100) > 0
  )
}

/**
 * D-133, D-210: a payment the registration site took. The desk's placeholder code starts with
 * `Manual_` (PAY-01a), and an amount that rounds to $0.00 is not a payment.
 */
export function isRealPayment(confirmationCode: string, amount: number): boolean {
  return !confirmationCode.startsWith(manualPrefix) && Math.round(amount * 100) > 0
}

/** The processing system of a stored code `<system>_<code>` (PAY-02). */
export function paymentSystem(confirmationCode: string): string {
  const at = confirmationCode.indexOf('_')
  return at === -1 ? confirmationCode : confirmationCode.slice(0, at)
}

/** PAY-02 and PAY-04: the stored code is `<system>_<code>`; the time is the server's. */
export function toNewPayment(payment: PaymentInput, id: string, now: Date): NewPayment {
  return {
    id,
    confirmationCode: `${payment.processingSystem}_${payment.confirmationCode}`,
    amount: payment.amount,
    createdAtUtc: now,
  }
}
