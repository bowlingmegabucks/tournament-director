import { formatFee, formatRatio, formatSessionDate } from '../../shared/sessionFormat'
import type { SquadField, SquadFormValues } from './types'

const names: Record<SquadField, string> = {
  date: 'Date',
  startingLane: 'Starting lane',
  numberOfLanes: 'Number of lanes',
  maxPerPair: 'Bowlers per pair',
  entryFee: 'Entry fee',
  finalsRatio: 'Finals ratio',
  cashRatio: 'Cash ratio',
}

function show(field: SquadField, value: string): string {
  const trimmed = value.trim()
  const number = Number(trimmed)
  // A blank fee or ratio means the squad uses the tournament's value (D-183).
  if (trimmed === '') return field === 'date' ? 'not set' : "the tournament's value"
  if (field === 'date') return formatSessionDate(`${trimmed}:00`)
  if (field === 'entryFee' && Number.isFinite(number)) return formatFee(number)
  if ((field === 'finalsRatio' || field === 'cashRatio') && Number.isFinite(number)) {
    return formatRatio(number)
  }
  return trimmed
}

/** One line of the confirm dialog: "Entry fee: $60.00 → $75.00" (D-180). */
export function describeChange(
  field: SquadField,
  initial: SquadFormValues,
  values: SquadFormValues,
): string {
  return `${names[field]}: ${show(field, initial[field])} → ${show(field, values[field])}`
}
