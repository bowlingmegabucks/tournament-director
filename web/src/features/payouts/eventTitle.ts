import type { PayoutSheet } from './types'

/** The page title of an event: the session tabs sit under the session's own heading (D-276). */
export function titleOf(sheet: PayoutSheet): string {
  switch (sheet.event.source) {
    case 'squad':
    case 'sweeper':
      return 'Payouts'
    case 'superSweeper':
      return 'Super sweeper payouts'
    case 'finals':
      return `Finals payouts: ${sheet.event.divisionName ?? ''}`
  }
}
