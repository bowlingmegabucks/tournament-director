import { faker } from '@faker-js/faker'
import type { StoredBowler } from './bowler.ts'

/** A stored bowler with every field filled, so a test can see which ones a patch left alone. */
export function createCommonBowler(overrides: Partial<StoredBowler> = {}): StoredBowler {
  return {
    id: faker.string.uuid(),
    firstName: 'Joseph',
    middleInitial: 'Q',
    lastName: 'Fontaine',
    suffix: 'Jr',
    street: '9 Old Rd',
    city: 'Durham',
    state: 'NC',
    zipCode: '27701',
    email: 'old@example.com',
    phoneNumber: '9195550101',
    usbcId: '1234-56789',
    dateOfBirth: '1960-05-05',
    gender: 'Female',
    ...overrides,
  }
}
