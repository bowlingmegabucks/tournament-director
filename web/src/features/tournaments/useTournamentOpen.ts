import { useTournamentSettings } from './useTournamentSettings'

/**
 * Whether an add or edit link may show: not while the settings load, and not on a complete
 * tournament (D-143, D-149, D-171, D-19). If the settings fail it shows anyway: the API refuses a
 * complete tournament, and a slow start must not take the link away. Every caller shares one
 * cached read.
 */
export function useTournamentOpen(id: string): boolean {
  const settings = useTournamentSettings(id)
  return !settings.isPending && settings.data?.completed !== true
}
