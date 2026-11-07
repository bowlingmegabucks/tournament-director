import { formatFee, formatRatio, formatSessionDate } from '../../shared/sessionFormat'
import type { FormDivision } from './SweeperForm'
import { pinKey, type SweeperFormValues, type SweeperScalarField } from './types'

const names: Record<SweeperScalarField, string> = {
  date: 'Date',
  startingLane: 'Starting lane',
  numberOfLanes: 'Number of lanes',
  maxPerPair: 'Bowlers per pair',
  entryFee: 'Entry fee',
  games: 'Games',
  cashRatio: 'Cash ratio',
}

function show(field: SweeperScalarField, value: string): string {
  const trimmed = value.trim()
  const number = Number(trimmed)
  if (trimmed === '') return 'not set'
  if (field === 'date') return formatSessionDate(`${trimmed}:00`)
  if (field === 'entryFee' && Number.isFinite(number)) return formatFee(number)
  if (field === 'cashRatio' && Number.isFinite(number)) return formatRatio(number)
  return trimmed
}

const showPins = (value: string | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed === '' || trimmed === '0' ? 'none' : trimmed
}

/** One line of the confirm dialog: "Cash ratio: 1 in 5 → 1 in 4", "Open bonus pins: 10 → 8" (D-180). */
export function describeChange(
  field: string,
  initial: SweeperFormValues,
  values: SweeperFormValues,
  divisions: readonly FormDivision[],
): string {
  const division = divisions.find((candidate) => pinKey(candidate.id) === field)
  if (division) {
    return `${division.name} bonus pins: ${showPins(initial.bonusPins[division.id])} → ${showPins(values.bonusPins[division.id])}`
  }
  if (!(field in names)) return ''
  const name = field as SweeperScalarField
  return `${names[name]}: ${show(name, initial[name])} → ${show(name, values[name])}`
}
