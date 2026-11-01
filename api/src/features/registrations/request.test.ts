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
