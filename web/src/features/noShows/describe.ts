import { formatSessionDate } from '../../shared/sessionFormat'
import type { AtLargeChange, PayoutChange, SquadChange } from './types'

const verbs: Record<SquadChange['change'], string> = {
  losesAdvance: 'no longer advances',
  gainsAdvance: 'now advances',
  losesCash: 'no longer cashes',
  gainsCash: 'now cashes',
}

export function describeChange({ name, change, divisionName, squadDate }: SquadChange): string {
  return `${name} ${verbs[change]} (${divisionName}, ${formatSessionDate(squadDate)}).`
}

export function describeAtLarge(change: AtLargeChange): string {
  const { divisionName, spotsBefore, spotsAfter, joins, leaves } = change
  const parts = [`${divisionName} at-large spots: ${spotsBefore} now, ${spotsAfter} after.`]
  if (joins.length > 0) parts.push(`In: ${joins.join(', ')}.`)
  if (leaves.length > 0) parts.push(`Out: ${leaves.join(', ')}.`)
  return parts.join(' ')
}

export function describePayout({ name, label, amount, note }: PayoutChange): string {
  const start = `${name}, ${label}, $${amount}: the payout stays and`
  // The system note is a whole sentence, so it ends the line itself.
  return note === null ? `${start} keeps the note it has.` : `${start} gets the note “${note}”`
}
