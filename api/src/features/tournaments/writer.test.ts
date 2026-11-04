import { describe, expect, it } from 'vitest'
import { createNewTournament } from '../../test/factories.ts'
import { createInMemoryTournamentWriter, sameTournament } from './writer.ts'

describe('sameTournament (TRN-20, D-123)', () => {
  const input = { name: 'Spring Classic', startDate: '2027-03-12' }

  it('matches the same name and start date', () => {
    expect(sameTournament({ ...input }, input)).toBe(true)
  })

  it.each(['SPRING CLASSIC', '  Spring Classic  ', ' spring classic'])(
    'matches a stored name written as %j',
    (name) => {
      expect(sameTournament({ name, startDate: '2027-03-12' }, input)).toBe(true)
    },
  )

  it('matches when the new name has other case or spaces', () => {
    expect(sameTournament(input, { name: '  SPRING classic ', startDate: '2027-03-12' })).toBe(true)
  })

  it('does not match another start date', () => {
    expect(sameTournament({ name: 'Spring Classic', startDate: '2027-03-13' }, input)).toBe(false)
  })

  it('does not match another name', () => {
    expect(sameTournament({ name: 'Fall Classic', startDate: '2027-03-12' }, input)).toBe(false)
  })
})

describe('in-memory tournament writer', () => {
  it('stores a copy and gives each tournament its own id', async () => {
    const { writer, stored } = createInMemoryTournamentWriter()
    const input = createNewTournament()

    const first = await writer.create({ ...input, startDate: '2030-01-01', endDate: '2030-01-02' })
    const second = await writer.create({ ...input, startDate: '2031-01-01', endDate: '2031-01-02' })

    if (!('created' in first) || !('created' in second)) throw new Error('expected created')
    expect(first.created.id).not.toBe(second.created.id)
    first.created.name = 'Changed'
    expect(stored[0]?.name).toBe(input.name)
  })

  it('reports a duplicate of a seeded tournament', async () => {
    const input = createNewTournament()
    const { writer } = createInMemoryTournamentWriter([{ id: crypto.randomUUID(), ...input }])

    expect(await writer.create(input)).toEqual({ duplicate: true })
  })
})
