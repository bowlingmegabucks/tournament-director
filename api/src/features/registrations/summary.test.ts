import { describe, expect, it } from 'vitest'
import {
  createDivision,
  createRegistration,
  createSquad,
  createSweeper,
} from '../../test/factories.ts'
import { summarize } from './summary.ts'

describe('summarize', () => {
  it('counts registrations and super sweepers (REG-24)', () => {
    const summary = summarize(
      [
        createRegistration({ superSweeper: true }),
        createRegistration({ superSweeper: true }),
        createRegistration(),
      ],
      [],
      [],
      [],
    )

    expect(summary.registrations).toBe(3)
    expect(summary.superSweepers).toBe(2)
  })

  it('counts the squads each bowler in a division entered, not the sweepers (REG-24)', () => {
    const open = createDivision({ number: 1, name: 'Open' })
    const women = createDivision({ number: 2, name: 'Women' })
    const [first, second] = [createSquad(), createSquad()]
    const sweeper = createSweeper()
    const summary = summarize(
      [
        createRegistration({
          divisionId: open.id,
          squadIds: [first.id, second.id],
          sweeperIds: [sweeper.id],
        }),
        createRegistration({ divisionId: open.id, squadIds: [first.id] }),
        createRegistration({ divisionId: women.id, squadIds: [second.id] }),
      ],
      [open, women],
      [first, second],
      [sweeper],
    )

    expect(summary.divisions).toEqual([
      { id: open.id, number: 1, name: 'Open', entries: 3 },
      { id: women.id, number: 2, name: 'Women', entries: 1 },
    ])
  })

  it('counts entries per squad and per sweeper (REG-24)', () => {
    const [first, second] = [createSquad(), createSquad()]
    const sweeper = createSweeper()
    const summary = summarize(
      [
        createRegistration({ squadIds: [first.id, second.id], sweeperIds: [sweeper.id] }),
        createRegistration({ squadIds: [first.id], sweeperIds: [sweeper.id] }),
      ],
      [],
      [first, second],
      [sweeper],
    )

    expect(summary.squads).toEqual([
      { id: first.id, date: first.date, entries: 2 },
      { id: second.id, date: second.date, entries: 1 },
    ])
    expect(summary.sweepers).toEqual([{ id: sweeper.id, date: sweeper.date, entries: 2 }])
  })

  it('lists a division, squad, and sweeper nobody entered with 0 (REG-24, D-50)', () => {
    const division = createDivision()
    const squad = createSquad()
    const sweeper = createSweeper()

    const summary = summarize([], [division], [squad], [sweeper])

    expect(summary.divisions[0]?.entries).toBe(0)
    expect(summary.squads[0]?.entries).toBe(0)
    expect(summary.sweepers[0]?.entries).toBe(0)
  })

  it('counts a complete squad like any other (REG-24, D-06)', () => {
    const squad = createSquad({ complete: true })

    const summary = summarize([createRegistration({ squadIds: [squad.id] })], [], [squad], [])

    expect(summary.squads[0]?.entries).toBe(1)
  })

  it('keeps the order it is given (REG-24)', () => {
    const [a, b] = [createSquad(), createSquad()]

    const summary = summarize([], [], [b, a], [])

    expect(summary.squads.map((squad) => squad.id)).toEqual([b.id, a.id])
  })
})
