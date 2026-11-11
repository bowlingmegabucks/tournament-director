import type { Bowler } from '../data/bowlers'
import type { VendorRegistration, VendorTournament } from './vendorApi'

/** The create body the registration site sends for one bowler (API-05), with a Stripe payment. */
export function vendorRegistration(
  bowler: Bowler,
  tournament: VendorTournament,
  entries: {
    divisionId: string
    squadIds: string[]
    sweeperIds: string[]
    superSweeper: boolean
    amount: number
    /** Makes the payment code unique per tournament and bowler (D-109). */
    codePrefix: string
  },
): VendorRegistration {
  return {
    tournamentId: tournament.id,
    divisionId: entries.divisionId,
    average: bowler.average,
    squads: entries.squadIds,
    sweepers: entries.sweeperIds,
    superSweeper: entries.superSweeper,
    bowler: {
      firstName: bowler.firstName,
      lastName: bowler.lastName,
      address: {
        street: bowler.street,
        city: bowler.city,
        state: bowler.state,
        zipCode: bowler.zipCode,
      },
      email: bowler.email,
      phoneNumber: bowler.phoneNumber,
      usbcId: bowler.usbcId,
      dateOfBirth: bowler.dateOfBirth,
      gender: bowler.gender,
    },
    payment: {
      processingSystem: 'Stripe',
      confirmationCode: `${entries.codePrefix}_${bowler.index}`,
      amount: entries.amount,
    },
  }
}

/** The id of the squad or sweeper whose date is this `YYYY-MM-DDTHH:mm` (the API adds `:00`). */
export function idByDate(sessions: { id: string; date: string }[], date: string): string {
  const found = sessions.find((session) => session.date === `${date}:00`)
  if (!found) throw new Error(`No squad or sweeper dated ${date}`)
  return found.id
}

export function idByName(items: { id: string; name: string }[], name: string): string {
  const found = items.find((item) => item.name === name)
  if (!found) throw new Error(`No item named ${name}`)
  return found.id
}
