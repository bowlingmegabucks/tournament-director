import type { Division } from '../divisions/types.ts'
import type { Gender } from './bowler.ts'
import { validation, type Failure } from './problem.ts'

/** BWL-09: whole years on a date, one less before the birthday. Both are `YYYY-MM-DD`. */
export function ageOn(dateOfBirth: string, on: string): number {
  const [birthYear = 0, birthMonth = 0, birthDay = 0] = dateOfBirth.split('-').map(Number)
  const [year = 0, month = 0, day = 0] = on.split('-').map(Number)
  const birthdayPassed = month > birthMonth || (month === birthMonth && day >= birthDay)
  return year - birthYear - (birthdayPassed ? 0 : 1)
}

export interface EligibilityInput {
  division: Division
  average: number | null
  bowler: { dateOfBirth: string | null; gender: Gender | null; usbcId: string }
  /** `YYYY-MM-DD`; age counts on this day (BWL-09). */
  tournamentStart: string
}

type Fail = (code: string, description: string) => void

function checkAverage(division: Division, average: number | null, fail: Fail) {
  const { minimumAverage, maximumAverage } = division
  if ((minimumAverage !== null || maximumAverage !== null) && average === null) {
    fail('Registration.AverageRequired', 'Average is required for selected division')
  }
  if (average !== null && minimumAverage !== null && average < minimumAverage) {
    fail('Registration.AverageTooLow', 'Minimum average requirement for division not met')
  }
  if (average !== null && maximumAverage !== null && average > maximumAverage) {
    fail('Registration.AverageTooHigh', 'Maximum average requirement for division not met')
  }
}

function checkAge(
  division: Division,
  bowler: EligibilityInput['bowler'],
  tournamentStart: string,
  fail: Fail,
) {
  const { minimumAge, maximumAge } = division
  if (
    (minimumAge !== null || maximumAge !== null) &&
    division.gender === null &&
    bowler.dateOfBirth === null
  ) {
    fail('Registration.DateOfBirthRequired', 'Date of birth required for selected division')
  }

  // A division with a gender lets that gender in without the age test ("Women or Seniors").
  const ageApplies = division.gender === null || division.gender !== bowler.gender
  const age = bowler.dateOfBirth === null ? 0 : ageOn(bowler.dateOfBirth, tournamentStart)
  if (minimumAge !== null && ageApplies && age < minimumAge) {
    fail('Registration.BowlerTooYoung', 'Bowler too young for selected division')
  }
  if (maximumAge !== null && ageApplies && age > maximumAge) {
    fail('Registration.BowlerTooOld', 'Bowler too old for selected division')
  }
}

function checkGender(division: Division, bowler: EligibilityInput['bowler'], fail: Fail) {
  const hasAgeLimit = division.minimumAge !== null || division.maximumAge !== null
  if (division.gender === null || hasAgeLimit) return
  if (bowler.gender === null) {
    fail('Registration.GenderRequired', 'Gender is required for selected division')
  }
  if (bowler.gender !== division.gender) {
    fail('Registration.GenderInvalid', 'Invalid gender for selected division')
  }
}

/**
 * REG-04a to REG-04h and REG-05. A failure is a 400 for every caller (D-107).
 * With no date of birth the age is 0, so a minimum age fails and a maximum age passes, as in legacy.
 */
export function checkEligibility({
  division,
  average,
  bowler,
  tournamentStart,
}: EligibilityInput): Failure[] {
  const failures: Failure[] = []
  const fail: Fail = (code, description) => {
    failures.push(validation(code, description))
  }

  checkAverage(division, average, fail)
  checkAge(division, bowler, tournamentStart, fail)
  checkGender(division, bowler, fail)
  if (division.handicapPercentage !== null && bowler.usbcId === '') {
    fail('Registration.UsbcIdRequired', 'USBC Id is required for Handicap Divisions')
  }
  return failures
}
