import { describe, expect, it } from 'vitest'
import type { NewDivision } from './createRequest.ts'
import { createInMemoryDivisionWriter } from './writer.ts'

const input: NewDivision = {
  name: 'Open',
  gender: null,
  minimumAge: null,
  maximumAge: null,
  minimumAverage: null,
  maximumAverage: null,
  handicapPercentage: null,
  handicapBase: null,
  maximumHandicapPerGame: null,
}
const tournamentId = '11111111-1111-4111-8111-111111111111'

describe('in-memory division writer', () => {
  it('stores a division with the next number and a new id (DIV-12, D-139)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter()

    const first = await writer.create(tournamentId, input, { confirmWarnings: false })
    const second = await writer.create(
      tournamentId,
      { ...input, name: 'Women' },
      { confirmWarnings: false },
    )

    if (!('created' in first) || !('created' in second)) throw new Error('expected both created')
    expect([first.created.number, second.created.number]).toEqual([1, 2])
    expect(first.created.id).not.toBe(second.created.id)
    expect(stored).toHaveLength(2)
  })

  it('numbers each tournament on its own (D-139)', async () => {
    const { writer } = createInMemoryDivisionWriter()
    await writer.create(tournamentId, input, { confirmWarnings: false })

    const other = await writer.create('22222222-2222-4222-8222-222222222222', input, {
      confirmWarnings: false,
    })

    expect(other).toMatchObject({ created: { number: 1 } })
  })

  it('answers notFound for a tournament it does not know (DIV-03)', async () => {
    const { writer } = createInMemoryDivisionWriter({ known: [] })

    expect(await writer.create(tournamentId, input, { confirmWarnings: false })).toEqual({
      notFound: true,
    })
  })

  it('refuses a complete tournament and stores nothing (D-143)', async () => {
    const { writer, stored } = createInMemoryDivisionWriter({ completed: [tournamentId] })

    const outcome = await writer.create(tournamentId, input, { confirmWarnings: false })

    expect(outcome).toMatchObject({ refused: { tournament: expect.any(String) } })
    expect(stored).toHaveLength(0)
  })
})
