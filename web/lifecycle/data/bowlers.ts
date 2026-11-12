import bowlersJson from './bowlers.json' with { type: 'json' }

/** One bowler of the fixture (`bowlers.json`, made by `generateBowlers.ts`). */
export interface Bowler {
  index: number
  firstName: string
  lastName: string
  street: string
  city: string
  state: string
  zipCode: string
  email: string
  phoneNumber: string
  usbcId: string
  gender: 'F' | 'M'
  age: number
  dateOfBirth: string
  average: number
}

export const bowlers: Bowler[] = bowlersJson as Bowler[]

/** Bowlers 0 to 49 bowled the earlier tournament, so they exist before the main one (D-05). */
export const returning = bowlers.slice(0, 50)
/** Bowlers 0 to 89: 60% of the 150 register through the registration site (the API key). */
export const siteBowlers = bowlers.slice(0, 90)
/** Bowlers 90 to 149 are new and register at the desk. */
export const deskBowlers = bowlers.slice(90)

export const fullName = (bowler: Bowler) => `${bowler.firstName} ${bowler.lastName}`

/** A bowler by number. */
export function bowlerAt(index: number): Bowler {
  const found = bowlers[index]
  if (!found) throw new Error(`No bowler ${index}`)
  return found
}
