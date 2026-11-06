import type { DivisionField, DivisionFormValues } from './types'

const names: Record<DivisionField, string> = {
  name: 'Name',
  gender: 'Gender',
  minimumAge: 'Minimum age',
  maximumAge: 'Maximum age',
  minimumAverage: 'Minimum average',
  maximumAverage: 'Maximum average',
  handicapPercentage: 'Handicap percent',
  handicapBase: 'Handicap base',
  maximumHandicapPerGame: 'Maximum handicap per game',
}

function show(field: DivisionField, value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return field === 'gender' ? 'any gender' : 'not set'
  return field === 'handicapPercentage' ? `${trimmed}%` : trimmed
}

/** One line of the confirm dialog: "Handicap percent: 90% → 85%" (D-147). */
export function describeChange(
  field: DivisionField,
  initial: DivisionFormValues,
  values: DivisionFormValues,
): string {
  return `${names[field]}: ${show(field, initial[field])} → ${show(field, values[field])}`
}
