import type { Gender, StoredBowler } from './bowler.ts'

/**
 * The bowler as the desk form reads it: every stored field except the SSN (BWL-17), a missing
 * birth date or gender as an empty string. The web `BowlerValues` has the same fields.
 */
export function toBowlerValues(bowler: StoredBowler): Omit<
  StoredBowler,
  'dateOfBirth' | 'gender'
> & {
  dateOfBirth: string
  gender: Gender | ''
} {
  return {
    id: bowler.id,
    firstName: bowler.firstName,
    middleInitial: bowler.middleInitial,
    lastName: bowler.lastName,
    suffix: bowler.suffix,
    street: bowler.street,
    city: bowler.city,
    state: bowler.state,
    zipCode: bowler.zipCode,
    email: bowler.email,
    phoneNumber: bowler.phoneNumber,
    usbcId: bowler.usbcId,
    dateOfBirth: bowler.dateOfBirth ?? '',
    gender: bowler.gender ?? '',
  }
}
