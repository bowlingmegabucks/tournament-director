import { faker } from '@faker-js/faker'

/** The body from `integration-api.md` (`API-05`), with new ids. */
export function sampleRequest(overrides: Record<string, unknown> = {}) {
  return {
    registration: {
      tournamentId: faker.string.uuid(),
      divisionId: faker.string.uuid(),
      average: 185,
      squads: [faker.string.uuid()],
      sweepers: [faker.string.uuid()],
      superSweeper: false,
      bowler: {
        firstName: 'Joe',
        middleInitial: 'J',
        lastName: 'Fontaine',
        suffix: null,
        address: { street: '1 Main St', city: 'Raleigh', state: 'NC', zipCode: '27601' },
        email: 'joe@example.com',
        phoneNumber: '919-555-1212',
        usbcId: '1234-56789',
        dateOfBirth: '1970-01-31',
        gender: 'M',
      },
      payment: { processingSystem: 'Stripe', confirmationCode: 'ch_123', amount: 75 },
      ...overrides,
    },
  }
}
