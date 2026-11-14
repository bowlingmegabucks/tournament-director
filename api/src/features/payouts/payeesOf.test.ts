import { describe, expect, it } from 'vitest'
import type {
  SeedingDivision,
  SquadResults,
  SuperSweeperResults,
  SweeperResults,
} from '../results/types.ts'
import { finalsPayees, squadPayees, superSweeperPayees, sweeperPayees } from './payeesOf.ts'

const common = (id: string, name: string, place: number) => ({
  registrationId: id,
  name,
  place,
  total: 1000,
  games: 5,
  ties: [],
  payout: null,
})

describe('squadPayees (PAY-02)', () => {
  it('lists the cashers of every division, never an advancer or an other', () => {
    const results = {
      divisions: [
        {
          name: 'Open',
          rows: [
            { ...common('adv', 'Lois Park', 1), group: 'advancer' },
            { ...common('c1', 'Dana Whitfield', 9), group: 'casher' },
            { ...common('oth', 'Tom Becker', 14), group: 'other' },
          ],
        },
        { name: 'Women/Senior', rows: [{ ...common('c2', 'Priya Raman', 3), group: 'casher' }] },
      ],
    } as unknown as SquadResults

    expect(squadPayees(results)).toEqual([
      {
        registrationId: 'c1',
        name: 'Dana Whitfield',
        divisionName: 'Open',
        detail: 'cashed, place 9',
        seed: null,
        previousCasher: false,
      },
      {
        registrationId: 'c2',
        name: 'Priya Raman',
        divisionName: 'Women/Senior',
        detail: 'cashed, place 3',
        seed: null,
        previousCasher: false,
      },
    ])
  })
})

describe('sweeperPayees and superSweeperPayees (PAY-03, PAY-04)', () => {
  const rows = [
    { ...common('c1', 'Dana Whitfield', 1), group: 'casher', divisionName: 'Open' },
    { ...common('o1', 'Tom Becker', 2), group: 'other', divisionName: 'Open' },
  ]

  it('lists the cashers of a sweeper', () => {
    const payees = sweeperPayees({ rows } as unknown as SweeperResults)
    expect(payees.map((payee) => payee.registrationId)).toEqual(['c1'])
    expect(payees[0]).toMatchObject({
      divisionName: 'Open',
      detail: 'cashed, place 1',
      previousCasher: false,
      seed: null,
    })
  })

  it('lists the cashers of the super sweeper', () => {
    const payees = superSweeperPayees({ rows } as unknown as SuperSweeperResults)
    expect(payees.map((payee) => payee.registrationId)).toEqual(['c1'])
    expect(payees[0]).toMatchObject({
      divisionName: 'Open',
      detail: 'cashed, place 1',
      previousCasher: false,
      seed: null,
    })
  })
})

describe('finalsPayees (PAY-05)', () => {
  it('lists the finalists in seed order with the seed and the earlier cash', () => {
    const division = {
      name: 'Open',
      rows: [
        { ...common('f1', 'Dana Whitfield', 1), seed: 1, group: 'finalist', previousCasher: false },
        { ...common('f2', 'Lois Park', 2), seed: 2, group: 'finalist', previousCasher: true },
        { ...common('x', 'Tom Becker', 9), seed: 9, group: 'other', previousCasher: false },
      ],
    } as unknown as SeedingDivision

    expect(finalsPayees(division)).toEqual([
      {
        registrationId: 'f1',
        name: 'Dana Whitfield',
        divisionName: 'Open',
        detail: 'seed 1',
        seed: 1,
        previousCasher: false,
      },
      {
        registrationId: 'f2',
        name: 'Lois Park',
        divisionName: 'Open',
        detail: 'seed 2',
        seed: 2,
        previousCasher: true,
      },
    ])
  })
})
