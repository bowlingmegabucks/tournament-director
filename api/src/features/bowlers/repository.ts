import { displayName } from '../registrations/registrationRow.ts'
import type { BowlerFilter, BowlerSearchResult } from './types.ts'
import { searchLimit } from './types.ts'

export interface BowlerSearchOutcome {
  bowlers: BowlerSearchResult[]
  more: boolean
}

/** What the search route needs from storage (BWL-14, D-157). */
export interface BowlerRepository {
  /** Sorted by last name, first name, id. At most `searchLimit` results; `more` says there were others. */
  search(filter: BowlerFilter): Promise<BowlerSearchOutcome>
}

// Ignores case and accents, as the database collation does (BWL-14).
export function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

export function compareBowlers(a: BowlerSearchResult, b: BowlerSearchResult): number {
  const byName = compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName)
  if (byName !== 0) return byName
  if (a.id < b.id) return -1
  return a.id > b.id ? 1 : 0
}

/** Cut a sorted list to the limit (the repository reads one more row than it shows). */
export function toOutcome(sorted: BowlerSearchResult[]): BowlerSearchOutcome {
  return { bowlers: sorted.slice(0, searchLimit), more: sorted.length > searchLimit }
}

export interface InMemoryBowler {
  id: string
  firstName: string
  lastName: string
  suffix: string
  email: string
  usbcId: string
  city: string
  state: string
}

const same = (a: string, b: string) => compareText(a, b) === 0
const startsWith = (value: string, prefix: string) =>
  value.slice(0, prefix.length).localeCompare(prefix, 'en', { sensitivity: 'base' }) === 0

export function createInMemoryBowlerRepository(
  bowlers: InMemoryBowler[],
  /** A bowler's registration in a tournament, for the `registered` marker. */
  registrations: { tournamentId: string; bowlerId: string; divisionName: string }[] = [],
): BowlerRepository {
  return {
    search: (filter) => {
      const found = bowlers
        .filter(
          (bowler) =>
            (filter.lastName === undefined || startsWith(bowler.lastName, filter.lastName)) &&
            (filter.firstName === undefined || startsWith(bowler.firstName, filter.firstName)) &&
            (filter.email === undefined || same(bowler.email, filter.email)) &&
            (filter.usbcId === undefined || same(bowler.usbcId, filter.usbcId)),
        )
        .map((bowler): BowlerSearchResult => {
          const registration = registrations.find(
            (entry) => entry.bowlerId === bowler.id && entry.tournamentId === filter.tournamentId,
          )
          return {
            id: bowler.id,
            name: displayName(bowler),
            firstName: bowler.firstName,
            lastName: bowler.lastName,
            usbcId: bowler.usbcId,
            city: bowler.city,
            state: bowler.state,
            registered: registration ? { divisionName: registration.divisionName } : null,
          }
        })
        .sort(compareBowlers)
      return Promise.resolve(toOutcome(found))
    },
  }
}
