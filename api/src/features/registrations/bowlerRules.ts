import { z } from 'zod'
import type { BowlerData } from './bowler.ts'
import { validation, type Failure } from './problem.ts'

// BWL-07 in two parts: nine or more digits with separators, then an optional extension.
const phoneBody = /^\+?\s*\d[\d\s\-.]*$/
const phoneExtension = /(ext|x|extension)\.?\s*\d{1,6}$/i

/** BWL-07 runs on the phone as sent, before it is cut down to ten digits. */
export function isValidPhone(raw: string): boolean {
  const body = raw.trim().replace(phoneExtension, '').trim()
  return phoneBody.test(body) && body.replace(/\D/g, '').length >= 9
}

function checkName(bowler: BowlerData): Failure[] {
  const failures: Failure[] = []
  if (bowler.firstName === '') {
    failures.push(validation('Bowler.FirstNameRequired', 'First Name is Required'))
  }
  if (bowler.middleInitial.length > 1) {
    failures.push(
      validation('Bowler.MiddleInitialTooLong', 'Middle Initial must only be 1 character'),
    )
  }
  if (bowler.lastName === '') {
    failures.push(validation('Bowler.LastNameRequired', 'Last Name is Required'))
  }
  return failures
}

// BWL-04 and BWL-05. The zip is only checked when there is a street.
function checkAddress(bowler: BowlerData): Failure[] {
  const failures: Failure[] = []
  const hasStreet = bowler.street !== ''
  if (hasStreet && bowler.city === '') {
    failures.push(validation('Bowler.CityRequired', 'City is Required when Street is given'))
  }
  if (hasStreet && bowler.state.length !== 2) {
    failures.push(validation('Bowler.StateInvalid', 'State must be Postal Abbreviation'))
  }
  if (bowler.state === '' && hasStreet) {
    failures.push(validation('Bowler.StateRequired', 'State is required when Street is given'))
  } else if (bowler.state === '' && bowler.city !== '') {
    failures.push(validation('Bowler.StateRequired', 'State required when City is given'))
  }
  if (hasStreet && bowler.zipCode === '') {
    failures.push(
      validation('Bowler.ZipCodeInvalid', 'Valid Zip Code required when Street is given'),
    )
  }
  return failures
}

function checkDetails(
  bowler: BowlerData,
  options: { today: string; rawPhone: string | null | undefined },
): Failure[] {
  const failures: Failure[] = []
  if (bowler.email !== '' && !z.email().safeParse(bowler.email).success) {
    failures.push(validation('Bowler.EmailInvalid', 'Invalid Email'))
  }
  if (options.rawPhone && options.rawPhone.trim() !== '' && !isValidPhone(options.rawPhone)) {
    failures.push(validation('Bowler.PhoneInvalid', 'Invalid Phone Number'))
  }
  if (bowler.dateOfBirth !== null && bowler.dateOfBirth >= options.today) {
    failures.push(validation('Bowler.DateOfBirthInvalid', 'Date of Birth must be in the past'))
  }
  if (bowler.usbcId !== '' && !/^\d+-\d+$/.test(bowler.usbcId)) {
    failures.push(validation('Bowler.UsbcIdInvalid', 'Invalid USBC Id'))
  }
  return failures
}

/**
 * BWL-01 to BWL-08 and BWL-10, on the bowler as it will be stored (stored fields plus the patch).
 * `today` is `YYYY-MM-DD`. BWL-09 and BWL-11 are not here: age is in `eligibility.ts`, and the API
 * never sends an SSN.
 */
export function checkBowler(
  bowler: BowlerData,
  options: { today: string; rawPhone: string | null | undefined },
): Failure[] {
  return [...checkName(bowler), ...checkAddress(bowler), ...checkDetails(bowler, options)]
}
