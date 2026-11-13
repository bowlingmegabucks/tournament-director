import type {
  SeedingDivision,
  SquadResults,
  SuperSweeperResults,
  SweeperResults,
} from '../results/types.ts'
import type { Payee } from './types.ts'

/**
 * Who the results say gets paid (D-268). The amount is never inferred (D-270). A squad lists its
 * cashers, which leaves out the advancers (D-07); a sweeper and the super sweeper list their
 * cashers; the finals list every finalist of the division in seed order.
 */

export function squadPayees(results: SquadResults): Payee[] {
  return results.divisions.flatMap((division) =>
    division.rows
      .filter((row) => row.group === 'casher')
      .map((row) => ({
        registrationId: row.registrationId,
        name: row.name,
        divisionName: division.name,
        detail: `cashed, place ${row.place}`,
        seed: null,
        previousCasher: false,
      })),
  )
}

export function sweeperPayees(results: SweeperResults): Payee[] {
  return results.rows
    .filter((row) => row.group === 'casher')
    .map((row) => ({
      registrationId: row.registrationId,
      name: row.name,
      divisionName: row.divisionName,
      detail: `cashed, place ${row.place}`,
      seed: null,
      previousCasher: false,
    }))
}

export function superSweeperPayees(results: SuperSweeperResults): Payee[] {
  return results.rows
    .filter((row) => row.group === 'casher')
    .map((row) => ({
      registrationId: row.registrationId,
      name: row.name,
      divisionName: row.divisionName,
      detail: `cashed, place ${row.place}`,
      seed: null,
      previousCasher: false,
    }))
}

export function finalsPayees(division: SeedingDivision): Payee[] {
  return division.rows
    .filter((row) => row.group === 'finalist')
    .map((row) => ({
      registrationId: row.registrationId,
      name: row.name,
      divisionName: division.name,
      detail: `seed ${row.seed}`,
      seed: row.seed,
      previousCasher: row.previousCasher,
    }))
}
