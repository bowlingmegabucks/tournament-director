import type { BowlerInput } from './request.ts'

export type Gender = 'Male' | 'Female'

/** What the new app stores for a bowler, apart from the SSN, which it never reads or writes (BWL-17). */
export interface BowlerData {
  firstName: string
  /** `''` when none. */
  middleInitial: string
  lastName: string
  suffix: string
  street: string
  city: string
  state: string
  /** Digits only, `''` when none. */
  zipCode: string
  email: string
  /** Ten digits, or `''` (BWL-07a). */
  phoneNumber: string
  usbcId: string
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null
  gender: Gender | null
}

export interface StoredBowler extends BowlerData {
  id: string
}

/** Only the fields a request sent with a value (D-05). */
export type BowlerPatch = Partial<BowlerData>

const emptyBowler: BowlerData = {
  firstName: '',
  middleInitial: '',
  lastName: '',
  suffix: '',
  street: '',
  city: '',
  state: '',
  zipCode: '',
  email: '',
  phoneNumber: '',
  usbcId: '',
  dateOfBirth: null,
  gender: null,
}

/**
 * BWL-07a: digits only, a leading country code 1 dropped, exactly ten digits or `''`. An extension
 * is dropped with the rest of the non-digits only when it follows `ext`, `x`, or `extension`.
 */
export function normalizePhone(raw: string): string {
  // Stryker disable next-line StringLiteral: any text without digits drops the extension the same way.
  const withoutExtension = raw.trimEnd().replace(/(ext|x|extension)\.?\s*\d{1,6}$/i, '')
  const digits = withoutExtension.replace(/\D/g, '')
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return national.length === 10 ? national : ''
}

/** Five or nine digits, no dash (BWL-04); anything else is `''`, which the rules then refuse. */
export function normalizeZip(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 5 || digits.length === 9 ? digits : ''
}

/** D-113: `"F"` is Female; `"M"` and everything else is Male. */
export function genderOf(raw: string): Gender {
  return raw.trim().toUpperCase() === 'F' ? 'Female' : 'Male'
}

const present = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value.trim() !== ''

/**
 * D-05: the fields the request sent with a value. An empty string or null does not clear what is
 * stored. Used as is for a returning bowler, and on top of defaults for a new one.
 */
export function toBowlerPatch(input: BowlerInput): BowlerPatch {
  const patch: BowlerPatch = {}
  const text = (field: keyof BowlerData, value: string | null | undefined) => {
    if (present(value)) Object.assign(patch, { [field]: value.trim() })
  }
  text('firstName', input.firstName)
  text('middleInitial', input.middleInitial)
  text('lastName', input.lastName)
  text('suffix', input.suffix)
  text('street', input.address.street)
  text('city', input.address.city)
  text('state', input.address.state)
  text('email', input.email)
  text('usbcId', input.usbcId)
  const zipCode = normalizeZip(input.address.zipCode)
  if (zipCode !== '') patch.zipCode = zipCode
  // Stryker disable next-line StringLiteral: any text without digits normalizes to ''.
  const phoneNumber = normalizePhone(input.phoneNumber ?? '')
  if (phoneNumber !== '') patch.phoneNumber = phoneNumber
  if (present(input.dateOfBirth)) patch.dateOfBirth = input.dateOfBirth
  if (present(input.gender)) patch.gender = genderOf(input.gender)
  return patch
}

/** A new desk bowler: the fields sent on top of empty text, and no gender unless one was picked (D-162). */
export function toNewDeskBowler(patch: BowlerPatch): BowlerData {
  return { ...emptyBowler, ...patch }
}

/** A new bowler: the fields sent, empty text for the rest, and Male when no gender came (D-113). */
export function toNewBowler(input: BowlerInput): BowlerData {
  return { ...emptyBowler, gender: 'Male', ...toBowlerPatch(input) }
}

/** The stored bowler with the patch on top, as the rules see it (D-05). */
export function mergeBowler(stored: BowlerData, patch: BowlerPatch): BowlerData {
  return { ...stored, ...patch }
}
