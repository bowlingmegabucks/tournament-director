import type { TournamentField, TournamentFormValues } from './types'

const names: Record<TournamentField, string> = {
  name: 'Name',
  startDate: 'Start date',
  endDate: 'End date',
  bowlingCenter: 'Bowling center',
  entryFee: 'Entry fee',
  games: 'Games',
  finalsRatio: 'Finals ratio',
  cashRatio: 'Cash ratio',
  superSweeperCashRatio: 'Super sweeper cash ratio',
}

// An empty value is a stored super sweeper ratio of 0 (D-17), which the form shows empty.
function show(field: TournamentField, value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return 'not set'
  return field === 'entryFee' ? `$${Number(trimmed).toFixed(2)}` : trimmed
}

/** One line of the confirm dialog: "Entry fee: $60.00 → $75.00" (TRN-30). */
export function describeChange(
  field: TournamentField,
  initial: TournamentFormValues,
  values: TournamentFormValues,
): string {
  return `${names[field]}: ${show(field, initial[field])} → ${show(field, values[field])}`
}
