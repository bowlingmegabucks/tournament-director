import { averageInUse, averageStatus, type AverageCheck } from './inUse.ts'
import type { CheckFacts } from './savePlan.ts'
import type { AverageRow } from './types.ts'

/** The registrations the Averages page lists, and whether the tournament is frozen (AVG-02, AVG-15). */
export interface AverageListing {
  tournamentComplete: boolean
  rows: AverageRow[]
}

/** What a save reads: the plan's facts, and the sessions to tell when it is done (D-298). */
export interface CheckReading extends CheckFacts {
  /** The squads and sweepers the registration is on. */
  sessionIds: string[]
}

/**
 * What the routes need to keep average checks (D-287): the `AverageVerifications` table in Prisma,
 * a list in memory for tests.
 */
export interface AverageStore {
  /** `undefined` for an unknown tournament. Only registrations in handicap divisions, last name first. */
  list(tournamentId: string): Promise<AverageListing | undefined>
  /** `undefined` for an unknown registration, or one in another tournament. */
  read(tournamentId: string, registrationId: string): Promise<CheckReading | undefined>
  save(registrationId: string, check: AverageCheck, actorId: string): Promise<void>
  remove(registrationId: string): Promise<void>
}

/** A registration of the in-memory store. */
export interface MemoryRegistration {
  id: string
  bowlerName: string
  divisionName: string
  usbcId?: string
  handicap?: boolean
  providedAverage: number | null
  minimumAverage?: number | null
  maximumAverage?: number | null
  scored?: { complete: boolean }[]
  sessionIds?: string[]
  check?: AverageCheck & { verifiedBy?: string; verifiedAt?: string }
}

/** Average checks kept in memory, for the route tests. */
export function createInMemoryAverageStore(
  seed: { tournamentId: string; complete?: boolean; registrations: MemoryRegistration[] }[],
): AverageStore & { saved: { registrationId: string; check: AverageCheck; actorId: string }[] } {
  const saved: { registrationId: string; check: AverageCheck; actorId: string }[] = []
  const find = (tournamentId: string, registrationId: string) => {
    const tournament = seed.find((entry) => entry.tournamentId === tournamentId)
    return {
      tournament,
      registration: tournament?.registrations.find((item) => item.id === registrationId),
    }
  }
  return {
    saved,
    list: (tournamentId) => {
      const tournament = seed.find((entry) => entry.tournamentId === tournamentId)
      if (!tournament) return Promise.resolve(undefined)
      const rows = tournament.registrations
        .filter((item) => item.handicap ?? true)
        .map((item): AverageRow => {
          const check = item.check
          return {
            registrationId: item.id,
            bowlerName: item.bowlerName,
            divisionName: item.divisionName,
            usbcId: item.usbcId ?? '',
            providedAverage: check ? check.providedAverage : item.providedAverage,
            status: averageStatus(check),
            averageInUse: averageInUse(item.providedAverage, check),
            note: check?.note ?? null,
            verifiedBy: check?.verifiedBy ?? null,
            verifiedAt: check?.verifiedAt ?? null,
          }
        })
      return Promise.resolve({ tournamentComplete: tournament.complete ?? false, rows })
    },
    read: (tournamentId, registrationId) => {
      const { tournament, registration } = find(tournamentId, registrationId)
      if (!tournament || !registration) return Promise.resolve(undefined)
      return Promise.resolve({
        bowlerName: registration.bowlerName,
        tournamentComplete: tournament.complete ?? false,
        handicap: registration.handicap ?? true,
        providedAverage: registration.providedAverage,
        minimumAverage: registration.minimumAverage ?? null,
        maximumAverage: registration.maximumAverage ?? null,
        scored: registration.scored ?? [],
        existing: registration.check,
        sessionIds: registration.sessionIds ?? [],
      })
    },
    save: (registrationId, check, actorId) => {
      saved.push({ registrationId, check, actorId })
      for (const entry of seed) {
        const registration = entry.registrations.find((item) => item.id === registrationId)
        if (registration) {
          registration.check = {
            ...check,
            verifiedBy: actorId,
            verifiedAt: new Date().toISOString(),
          }
        }
      }
      return Promise.resolve()
    },
    remove: (registrationId) => {
      for (const entry of seed) {
        const registration = entry.registrations.find((item) => item.id === registrationId)
        if (registration) registration.check = undefined
      }
      return Promise.resolve()
    },
  }
}
