import { describe, expect, it } from 'vitest'
import { sampleRequest } from '../../test/registrationRequests.ts'
import { parseCreateRequest } from './request.ts'

function codesOf(body: unknown): string[] {
  const result = parseCreateRequest(body)
  return result.success ? [] : result.failures.map((failure) => failure.code)
}

describe('parseCreateRequest', () => {
  it('accepts the sample body from the contract (API-05)', () => {
    expect(parseCreateRequest(sampleRequest()).success).toBe(true)
  })

  it('accepts a body with no payment, and nulls for the optional fields', () => {
    const body = sampleRequest({ payment: null, average: null })
    expect(parseCreateRequest(body).success).toBe(true)
  })

  it('needs the registration object (API-09)', () => {
    expect(codesOf({})).toEqual(['Registration.Required'])
    expect(codesOf(undefined)).toEqual(['Registration.Required'])
  })

  it('needs UUID tournament and division ids (API-09a)', () => {
    const body = sampleRequest({ tournamentId: 'nope', divisionId: '42' })
    expect(codesOf(body)).toEqual([
      'Registration.TournamentIdInvalid',
      'Registration.DivisionIdInvalid',
    ])
  })

  it('needs a first and last name, and treats spaces as empty (API-09b)', () => {
    const base = sampleRequest().registration.bowler
    const body = sampleRequest({ bowler: { ...base, firstName: '  ', lastName: '' } })
    expect(codesOf(body)).toEqual([
      'Registration.BowlerFirstNameRequired',
      'Registration.BowlerLastNameRequired',
    ])
  })

  it('needs an address, one code however many parts are missing (API-09c)', () => {
    const rest = Object.fromEntries(
      Object.entries(sampleRequest().registration.bowler).filter(([key]) => key !== 'address'),
    )
    expect(codesOf(sampleRequest({ bowler: rest }))).toEqual(['Registration.BowlerAddressRequired'])
    const partial = { ...rest, address: { street: 'x' } }
    expect(codesOf(sampleRequest({ bowler: partial }))).toEqual([
      'Registration.BowlerAddressRequired',
    ])
  })

  it('needs a valid email (API-09d)', () => {
    const base = sampleRequest().registration.bowler
    expect(codesOf(sampleRequest({ bowler: { ...base, email: 'not-an-email' } }))).toEqual([
      'Registration.BowlerEmailInvalid',
    ])
    expect(codesOf(sampleRequest({ bowler: { ...base, email: '' } }))).toEqual([
      'Registration.BowlerEmailInvalid',
    ])
  })

  it('needs a USBC id (API-09e)', () => {
    const base = sampleRequest().registration.bowler
    expect(codesOf(sampleRequest({ bowler: { ...base, usbcId: ' ' } }))).toEqual([
      'Registration.BowlerUsbcIdRequired',
    ])
  })

  it('needs at least one squad (API-09f)', () => {
    expect(codesOf(sampleRequest({ squads: [] }))).toEqual(['Registration.SquadsRequired'])
    expect(codesOf(sampleRequest({ squads: ['not-a-uuid'] }))).toEqual([
      'Registration.SquadsRequired',
    ])
  })

  it('reports every failed check together (API-09)', () => {
    const base = sampleRequest().registration.bowler
    const body = sampleRequest({ squads: [], bowler: { ...base, usbcId: '' } })
    expect(codesOf(body)).toEqual([
      'Registration.SquadsRequired',
      'Registration.BowlerUsbcIdRequired',
    ])
  })

  it('names other bad fields with a generic code', () => {
    expect(codesOf(sampleRequest({ superSweeper: 'yes' }))).toEqual(['Registration.Invalid'])
  })

  it('rejects a payment the table cannot hold (PAY-02)', () => {
    const tooLong = { processingSystem: 'Stripe', confirmationCode: 'x'.repeat(40), amount: 5 }
    const tooBig = { processingSystem: 'Stripe', confirmationCode: 'a', amount: 1000 }
    expect(codesOf(sampleRequest({ payment: tooLong }))).toEqual(['Payment.Invalid'])
    expect(codesOf(sampleRequest({ payment: tooBig }))).toEqual(['Payment.Invalid'])
  })

  it('marks every request failure as a validation error (API-12)', () => {
    const result = parseCreateRequest({})
    expect(!result.success && result.failures.every((f) => f.kind === 'validation')).toBe(true)
  })
})

describe('failure wording (API-09)', () => {
  const failuresOf = (body: unknown) => {
    const result = parseCreateRequest(body)
    return result.success ? [] : result.failures
  }
  const base = () => sampleRequest().registration
  const withBowler = (changes: Record<string, unknown>) =>
    sampleRequest({ bowler: { ...base().bowler, ...changes } })

  it.each([
    [{ registration: {} }, 'Registration.TournamentIdInvalid', 'Invalid Tournament ID'],
    [sampleRequest({ divisionId: 'x' }), 'Registration.DivisionIdInvalid', 'Invalid Division ID'],
    [
      withBowler({ firstName: '' }),
      'Registration.BowlerFirstNameRequired',
      "Bowler's first name is required.",
    ],
    [
      withBowler({ lastName: '' }),
      'Registration.BowlerLastNameRequired',
      "Bowler's last name is required.",
    ],
    [
      withBowler({ address: null }),
      'Registration.BowlerAddressRequired',
      "Bowler's address is required.",
    ],
    [
      withBowler({ email: 'x' }),
      'Registration.BowlerEmailInvalid',
      'A valid email address is required for the bowler.',
    ],
    [
      withBowler({ usbcId: '' }),
      'Registration.BowlerUsbcIdRequired',
      'USBC ID is required for the bowler.',
    ],
    [
      sampleRequest({ squads: [] }),
      'Registration.SquadsRequired',
      'At least one squad must be entered.',
    ],
  ])('words %#', (body, code, description) => {
    expect(failuresOf(body)).toContainEqual({ kind: 'validation', code, description })
  })

  it('words a missing registration object', () => {
    expect(failuresOf({})).toEqual([
      {
        kind: 'validation',
        code: 'Registration.Required',
        description: 'Registration details are required.',
      },
    ])
  })

  it('names the field for a check without its own code', () => {
    const [failure] = failuresOf(sampleRequest({ superSweeper: 'yes' }))
    expect(failure?.code).toBe('Registration.Invalid')
    expect(failure?.description).toMatch(/^superSweeper: /)
    const [nested] = failuresOf(withBowler({ middleInitial: 5 }))
    expect(nested?.description).toMatch(/^bowler\.middleInitial: /)
  })

  it('treats a registration that is not an object as missing', () => {
    expect(failuresOf({ registration: 'text' }).map((f) => f.code)).toEqual([
      'Registration.Required',
    ])
  })

  it('accepts a payment code of exactly 43 characters with its prefix, and refuses 44 (PAY-02)', () => {
    const payment = (length: number) => ({
      processingSystem: 'Stripe',
      confirmationCode: 'x'.repeat(length - 'Stripe_'.length),
      amount: 5,
    })
    expect(parseCreateRequest(sampleRequest({ payment: payment(43) })).success).toBe(true)
    expect(failuresOf(sampleRequest({ payment: payment(44) }))).toEqual([
      { kind: 'validation', code: 'Payment.Invalid', description: 'The payment is not valid.' },
    ])
  })

  it('accepts the amount limits of the column (PAY-02)', () => {
    const payment = (amount: number) => ({ processingSystem: 'S', confirmationCode: 'c', amount })
    expect(parseCreateRequest(sampleRequest({ payment: payment(0) })).success).toBe(true)
    expect(parseCreateRequest(sampleRequest({ payment: payment(999.99) })).success).toBe(true)
    expect(failuresOf(sampleRequest({ payment: payment(-1) }))).toHaveLength(1)
  })
})
