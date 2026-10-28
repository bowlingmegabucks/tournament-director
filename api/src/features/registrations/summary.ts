import type { Division } from '../divisions/types.ts'
import type { Squad } from '../squads/types.ts'
import type { Sweeper } from '../sweepers/types.ts'
import type { Registration, Summary } from './types.ts'

/**
 * Counts for the whole tournament (REG-24, D-50). Every division, squad, and sweeper is listed,
 * with 0 where nobody entered, in the order the caller gives them. A squad entry counts when the
 * `SquadRegistration` row exists, complete or not (D-06). A division counts squads, not sweepers.
 */
export function summarize(
  registrations: Registration[],
  divisions: Division[],
  squads: Squad[],
  sweepers: Sweeper[],
): Summary {
  const squadEntriesByDivision = new Map<string, number>()
  const entriesBySession = new Map<string, number>()
  for (const registration of registrations) {
    squadEntriesByDivision.set(
      registration.divisionId,
      (squadEntriesByDivision.get(registration.divisionId) ?? 0) + registration.squadIds.length,
    )
    for (const sessionId of [...registration.squadIds, ...registration.sweeperIds]) {
      entriesBySession.set(sessionId, (entriesBySession.get(sessionId) ?? 0) + 1)
    }
  }

  return {
    registrations: registrations.length,
    superSweepers: registrations.filter((registration) => registration.superSweeper).length,
    divisions: divisions.map(({ id, number, name }) => ({
      id,
      number,
      name,
      entries: squadEntriesByDivision.get(id) ?? 0,
    })),
    squads: squads.map(({ id, date, complete }) => ({
      id,
      date,
      complete,
      entries: entriesBySession.get(id) ?? 0,
    })),
    sweepers: sweepers.map(({ id, date, complete }) => ({
      id,
      date,
      complete,
      entries: entriesBySession.get(id) ?? 0,
    })),
  }
}
