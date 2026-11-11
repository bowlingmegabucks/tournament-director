// Writes data/bowlers.json. Run once with `node lifecycle/data/generateBowlers.ts` in web/ and commit
// the result (rule 4): a faker upgrade must not change the run's data, so the test reads the file and
// never calls faker itself. Gender, age, and average are fixed by formula; name, address, phone, and
// email are random with a fixed seed.
import { faker } from '@faker-js/faker'
import { writeFileSync } from 'node:fs'

const count = 150
const tournamentStartYear = 2025
faker.seed(20250312)

const states = ['MA', 'CT', 'NH', 'RI', 'VT', 'ME', 'NY', 'NJ']

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
    // On 12 March of the tournament year, after a 15 January birthday, so the age is exact.
    dateOfBirth: `${tournamentStartYear - age}-01-15`,
    average: 130 + ((index * 13) % 90),
  }
})

writeFileSync(new URL('./bowlers.json', import.meta.url), `${JSON.stringify(bowlers, null, 2)}\n`)
console.log(`Wrote ${bowlers.length} bowlers.`)
