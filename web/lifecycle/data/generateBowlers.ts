// Writes data/bowlers.json. Run once with `node lifecycle/data/generateBowlers.ts` in web/ and commit
// the result (rule 4): a faker upgrade must not change the run's data, so the test reads the file and
// never calls faker itself. Gender, age, and average are fixed by formula; name, address, phone,
// email, and the day of the year of the birth are random with a fixed seed. The birth date always
// falls in the one-year window that makes the bowler exactly `age` on the tournament's first day,
// so the division rules and the hand-worked counts do not depend on the random part.
import { faker } from '@faker-js/faker'
import { writeFileSync } from 'node:fs'

const count = 150
const tournamentStart = new Date('2025-03-12T00:00:00Z')
faker.seed(20250312)

const states = ['MA', 'CT', 'NH', 'RI', 'VT', 'ME', 'NY', 'NJ']

/** A random birth date that makes a bowler exactly `age` years old on the tournament's first day. */
function birthDate(age: number): string {
  // Born after (start - age - 1 years) and on or before (start - age years).
  const latest = new Date(tournamentStart)
  latest.setUTCFullYear(latest.getUTCFullYear() - age)
  const earliest = new Date(latest)
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 1)
  earliest.setUTCDate(earliest.getUTCDate() + 1)
  return faker.date.between({ from: earliest, to: latest }).toISOString().slice(0, 10)
}

const bowlers = Array.from({ length: count }, (_, index) => {
  const gender = index % 3 === 0 ? 'F' : 'M'
  const age = 18 + ((index * 17) % 58)
  const first = faker.person.firstName(gender === 'F' ? 'female' : 'male')
  const last = faker.person.lastName()
  return {
    index,
    firstName: first,
    lastName: last,
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.helpers.arrayElement(states),
    zipCode: faker.string.numeric(5),
    email: `${first}.${last}${index}@lifecycle.test`.toLowerCase().replace(/[^a-z0-9.@]/g, ''),
    phoneNumber: `${faker.number.int({ min: 200, max: 989 })}-555-${faker.string.numeric(4)}`,
    // Exact USBC ID, unique per bowler.
    usbcId: `${String(1000 + index)}-${String(10000 + index * 37)}`,
    gender,
    age,
    dateOfBirth: birthDate(age),
    average: 130 + ((index * 13) % 90),
  }
})

writeFileSync(new URL('./bowlers.json', import.meta.url), `${JSON.stringify(bowlers, null, 2)}\n`)
console.log(`Wrote ${bowlers.length} bowlers.`)
