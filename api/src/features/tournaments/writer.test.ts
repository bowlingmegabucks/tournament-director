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

describe('in-memory tournament writer: update (TRN-24, TRN-27)', () => {
  const first = { id: crypto.randomUUID(), ...createNewTournament({ name: 'Spring Classic' }) }
  const second = {
    id: crypto.randomUUID(),
    ...createNewTournament({
      name: 'Fall Classic',
      startDate: '2027-10-01',
      endDate: '2027-10-03',
    }),
  }

  it('changes the stored fields it was sent and answers with the whole tournament', async () => {
    const { writer, stored } = createInMemoryTournamentWriter([{ ...first }, { ...second }])

    const outcome = await writer.update(first.id, { name: 'Renamed', entryFee: 70 })

    expect(outcome).toEqual({
      updated: { ...first, name: 'Renamed', entryFee: 70 },
      changed: ['name', 'entryFee'],
    })
    expect(stored[0]).toMatchObject({ name: 'Renamed', entryFee: 70 })
    expect(stored[1]).toEqual(second)
  })

  it('does not put the completed flag in the answer (D-131)', async () => {
    const { writer } = createInMemoryTournamentWriter([{ ...first }])

    const outcome = await writer.update(first.id, { name: 'Renamed' })

    expect(outcome).not.toHaveProperty('updated.completed')
  })

  it('answers notFound for an unknown id', async () => {
    const { writer } = createInMemoryTournamentWriter([{ ...first }])

    expect(await writer.update(crypto.randomUUID(), { name: 'x' })).toEqual({ notFound: true })
  })

  it('writes nothing when no value differs', async () => {
    const { writer, stored } = createInMemoryTournamentWriter([{ ...first }])

    const outcome = await writer.update(first.id, { name: first.name })

    expect(outcome).toEqual({ updated: first, changed: [] })
    expect(stored[0]).toEqual(first)
  })

  it('refuses the name and start date of another tournament, but not its own', async () => {
    const { writer } = createInMemoryTournamentWriter([{ ...first }, { ...second }])

    expect(
      await writer.update(second.id, {
        name: ' spring CLASSIC ',
        startDate: first.startDate,
        endDate: first.endDate,
      }),
    ).toEqual({ duplicate: true })
    expect(await writer.update(first.id, { name: 'SPRING classic' })).toMatchObject({
      updated: { name: 'SPRING classic' },
    })
  })

  it('applies the facts it was given: a saved score locks the games (TRN-25)', async () => {
    const { writer, stored } = createInMemoryTournamentWriter([{ ...first }], {
      facts: { [first.id]: { hasScores: true } },
    })

    const outcome = await writer.update(first.id, { games: first.games + 1 })

    expect(outcome).toMatchObject({ refused: { games: expect.any(String) as string } })
    expect(stored[0]).toEqual(first)
  })

  it('freezes a tournament it was told is complete (TRN-25, D-130)', async () => {
    const { writer } = createInMemoryTournamentWriter([{ ...first }], { completed: [first.id] })

    expect(await writer.update(first.id, { name: 'Renamed' })).toMatchObject({
      refused: { name: expect.any(String) as string },
    })
  })

  it('stops at warnings until confirmed (TRN-26)', async () => {
    const { writer } = createInMemoryTournamentWriter([{ ...first }], {
      facts: { [first.id]: { registrationCount: 3 } },
    })

    expect(await writer.update(first.id, { entryFee: 99 })).toMatchObject({
      warnings: [{ field: 'entryFee' }],
    })
    expect(await writer.update(first.id, { entryFee: 99, confirmWarnings: true })).toMatchObject({
      updated: { entryFee: 99 },
    })
  })

  describe('remove (TRN-32 to TRN-34)', () => {
    it('answers notFound for an unknown id', async () => {
      const { writer } = createInMemoryTournamentWriter([{ ...first }])

      expect(await writer.remove(crypto.randomUUID(), { confirmWarnings: false })).toEqual({
        notFound: true,
      })
    })

    it('deletes a tournament with nothing under it', async () => {
      const { writer, stored, deleted } = createInMemoryTournamentWriter([{ ...first }])

      const outcome = await writer.remove(first.id, { confirmWarnings: false })

      expect(outcome).toMatchObject({ deleted: { registrations: 0 } })
      expect(stored).toEqual([])
      expect(deleted).toEqual([first.id])
    })

    it('refuses a complete tournament and keeps it (TRN-33, D-130)', async () => {
      const { writer, stored } = createInMemoryTournamentWriter([{ ...first }], {
        completed: [first.id],
      })

      expect(await writer.remove(first.id, { confirmWarnings: true })).toMatchObject({
        refused: [expect.any(String) as string],
      })
      expect(stored).toHaveLength(1)
    })

    it('stops at the registrations warning until confirmed (TRN-34)', async () => {
      const { writer, stored } = createInMemoryTournamentWriter([{ ...first }], {
        deleteFacts: { [first.id]: { registrations: 3 } },
      })

      expect(await writer.remove(first.id, { confirmWarnings: false })).toMatchObject({
        warnings: [{ field: 'tournament' }],
      })
      expect(stored).toHaveLength(1)
      expect(await writer.remove(first.id, { confirmWarnings: true })).toMatchObject({
        deleted: { registrations: 3 },
      })
      expect(stored).toEqual([])
    })
  })
})
