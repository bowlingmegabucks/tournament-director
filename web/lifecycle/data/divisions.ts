/** The three divisions of the run (stage 2), in the order they are made, so numbers are 1, 2, 3. */
export interface DivisionData {
  name: string
  number: number
  /** What the Divisions list shows in each column after the name. */
  gender: string
  ages: string
  averages: string
  handicap: string
  fields: Record<string, string>
}

export const scratch: DivisionData = {
  name: 'Scratch',
  number: 1,
  gender: 'Any',
  ages: 'Any',
  averages: 'Any',
  handicap: 'Scratch',
  fields: {},
}

export const handicap: DivisionData = {
  name: 'Handicap',
  number: 2,
  gender: 'Any',
  ages: 'Any',
  averages: 'Any',
  handicap: '90% of 220',
  fields: { 'Handicap percent': '90', 'Handicap base': '220' },
}

export const seniorWomen: DivisionData = {
  name: 'Women or Seniors',
  number: 3,
  gender: 'Female',
  ages: '50 and up',
  averages: '100 to 180',
  handicap: 'Scratch',
  fields: {
    'Minimum age': '50',
    'Minimum average': '100',
    'Maximum average': '180',
  },
}

export const divisions = [scratch, handicap, seniorWomen]
