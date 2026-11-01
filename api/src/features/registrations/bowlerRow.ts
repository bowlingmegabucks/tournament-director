import type { BowlerData, BowlerPatch, Gender, StoredBowler } from './bowler.ts'

/** The columns of a `Bowlers` row that the writer reads. The SSN is never among them (BWL-17). */
export interface BowlerRow {
  id: string
  firstName: string
  middleInitial: string
  lastName: string
  suffix: string
  street: string
  city: string
  state: string
  zipCode: string
  email: string
  phoneNumber: string
  usbcId: string
  dateOfBirth: Date | null
  gender: number | null
}

// database.md: 0 is Male, 1 is Female, NULL is unknown. Any other value reads as unknown.
export function genderFromColumn(value: number | null): Gender | null {
  if (value === 0) return 'Male'
  return value === 1 ? 'Female' : null
}

export function genderToColumn(gender: Gender | null): number | null {
  if (gender === null) return null
  return gender === 'Male' ? 0 : 1
}

// A stored date is midnight with no zone; Prisma reads it as UTC, so the digits are the stored ones.
function dateOnly(value: Date | null): string | null {
  return value === null || Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
}

export function toStoredBowler(row: BowlerRow): StoredBowler {
  return {
    id: row.id,
    firstName: row.firstName,
    middleInitial: row.middleInitial,
    lastName: row.lastName,
    suffix: row.suffix,
    street: row.street,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    email: row.email,
    phoneNumber: row.phoneNumber,
    usbcId: row.usbcId,
    dateOfBirth: dateOnly(row.dateOfBirth),
    gender: genderFromColumn(row.gender),
  }
}

export function dateColumn(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00Z`)
}

/** Only the columns the patch names. `undefined` leaves a column alone in Prisma (D-05). */
export function patchColumns(patch: BowlerPatch) {
  return {
    firstName: patch.firstName,
    middleInitial: patch.middleInitial,
    lastName: patch.lastName,
    suffix: patch.suffix,
    street: patch.street,
    city: patch.city,
    state: patch.state,
    zipCode: patch.zipCode,
    email: patch.email,
    phoneNumber: patch.phoneNumber,
    usbcId: patch.usbcId,
    dateOfBirth: patch.dateOfBirth === undefined ? undefined : dateColumn(patch.dateOfBirth),
    gender: patch.gender === undefined ? undefined : genderToColumn(patch.gender),
  }
}

export function newColumns(data: BowlerData) {
  return {
    firstName: data.firstName,
    middleInitial: data.middleInitial,
    lastName: data.lastName,
    suffix: data.suffix,
    street: data.street,
    city: data.city,
    state: data.state,
    zipCode: data.zipCode,
    email: data.email,
    phoneNumber: data.phoneNumber,
    usbcId: data.usbcId,
    dateOfBirth: dateColumn(data.dateOfBirth),
    gender: genderToColumn(data.gender),
  }
}
