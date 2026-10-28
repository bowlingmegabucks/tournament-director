import { storedRegistrationSchema } from './types.ts'

/** `Squads.SquadType` values. Any other value is not read (D-42, D-51). */
const squadType = 0
const sweeperType = 1

/**
 * The columns of the legacy `Registrations` table that the list reads, with the bowler and the
 * division name joined in. Prisma's model fits this; naming it here keeps the mapping testable
 * without Prisma. There is no SSN, gender, or birth date here on purpose (BWL-17).
 */
export interface RegistrationRow {
  id: string
  superSweeper: boolean
  bowler: {
    id: string
    firstName: string
    lastName: string
    suffix: string
    usbcId: string
  }
  division: { name: string }
  divisionId: string
  /** The squads and sweepers this registration bowls (`SquadRegistration`). */
  squads: { squad: { id: string; tournamentId: string; squadType: number } }[]
}

/** BWL-13: `First Last`, plus `, Suffix` when there is one. The middle initial is never shown. */
export function displayName(bowler: {
  firstName: string
  lastName: string
  suffix: string
}): string {
  const name = `${bowler.firstName} ${bowler.lastName}`
  return bowler.suffix === '' ? name : `${name}, ${bowler.suffix}`
}

/**
 * Turn a stored registration into the shape the list reads. The result says whether the row fits;
 * the repository skips and logs a row that does not (D-51). `BWL-01` to `BWL-12` run on save, not
 * on read. A squad of another tournament, or a `SquadType` that is neither squad nor sweeper, is
 * ignored (D-51).
 */
export function toRegistration(row: RegistrationRow, tournamentId: string) {
  const ofThisTournament = row.squads
    .map((entry) => entry.squad)
    .filter((squad) => squad.tournamentId === tournamentId)
  const idsOfType = (type: number) =>
    ofThisTournament.filter((squad) => squad.squadType === type).map((squad) => squad.id)
  return storedRegistrationSchema.safeParse({
    id: row.id,
    bowler: {
      id: row.bowler.id,
      name: displayName(row.bowler),
      firstName: row.bowler.firstName,
      lastName: row.bowler.lastName,
      usbcId: row.bowler.usbcId,
    },
    divisionId: row.divisionId,
    divisionName: row.division.name,
    superSweeper: row.superSweeper,
    squadIds: idsOfType(squadType),
    sweeperIds: idsOfType(sweeperType),
  })
}
