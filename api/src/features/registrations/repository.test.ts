import { describe, expect, it } from 'vitest'
import { createRegistration } from '../../test/factories.ts'
import { compareRegistrations, createInMemoryRegistrationRepository } from './repository.ts'

function named(firstName: string, lastName: string, id?: string) {
  const base = createRegistration()
  return createRegistration({
    ...(id ? { id } : {}),
    bowler: { ...base.bowler, firstName, lastName, name: `${firstName} ${lastName}` },
  })
}

describe('compareRegistrations', () => {
  it('sorts by last name, then first name (REG-23)', () => {
    const sorted = [named('Zed', 'Adams'), named('Amy', 'Young'), named('Bob', 'Adams')].sort(
      compareRegistrations,
    )

    expect(sorted.map((r) => r.bowler.name)).toEqual(['Bob Adams', 'Zed Adams', 'Amy Young'])
  })

  it('ignores case (REG-23)', () => {
    const sorted = [named('amy', 'young'), named('Bob', 'Adams')].sort(compareRegistrations)

    expect(sorted.map((r) => r.bowler.firstName)).toEqual(['Bob', 'amy'])
  })

  it('treats a last name that differs only in case as the same, so the first name decides (REG-23)', () => {
    const sorted = [named('Bob', 'adams'), named('Amy', 'Adams')].sort(compareRegistrations)

    expect(sorted.map((r) => r.bowler.firstName)).toEqual(['Amy', 'Bob'])
  })

  it('breaks a tie on the registration id (REG-23, D-51)', () => {
    const later = named('Joe', 'Fontaine', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    const earlier = named('Joe', 'Fontaine', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    expect(compareRegistrations(earlier, later)).toBeLessThan(0)
    expect(compareRegistrations(later, earlier)).toBeGreaterThan(0)
    expect([later, earlier].sort(compareRegistrations)).toEqual([earlier, later])
    expect([earlier, later].sort(compareRegistrations)).toEqual([earlier, later])
  })

  it('treats the same registration as equal', () => {
    const one = named('Joe', 'Fontaine')

    expect(compareRegistrations(one, { ...one })).toBe(0)
  })
})

describe('in-memory registration repository', () => {
  it("lists only the tournament's registrations, sorted (REG-23)", async () => {
    const mine = [named('Zed', 'Adams'), named('Amy', 'Adams')]
    const repository = createInMemoryRegistrationRepository([
      ...mine.map((registration) => ({ tournamentId: 't1', registration })),
      { tournamentId: 't2', registration: named('Other', 'Person') },
    ])

    const listed = await repository.listByTournament('t1')

    expect(listed.map((r) => r.bowler.firstName)).toEqual(['Amy', 'Zed'])
  })

  it('lists a bowler with two registrations twice (REG-27, D-48)', async () => {
    const bowler = createRegistration().bowler
    const repository = createInMemoryRegistrationRepository([
      { tournamentId: 't1', registration: createRegistration({ bowler }) },
      { tournamentId: 't1', registration: createRegistration({ bowler }) },
    ])

    await expect(repository.listByTournament('t1')).resolves.toHaveLength(2)
  })

  it('returns an empty list for a tournament with none', async () => {
    await expect(createInMemoryRegistrationRepository([]).listByTournament('t1')).resolves.toEqual(
      [],
    )
  })
})
