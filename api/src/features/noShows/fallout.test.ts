import { describe, expect, it } from 'vitest'
import { workOutFallout } from './fallout.ts'
import {
  field,
  noShow,
  open,
  openSquad,
  person,
  snapshotOf,
  squadOne,
  squadTwo,
  type Bowled,
} from './noShow.testData.ts'

const removal = { squadId: squadOne.id, registrationId: noShow.registrationId }
const keep = (n: number, squadId = squadOne.id) => ({
  squadId,
  registrationId: person(n).registrationId,
})
/** `count` bowlers who bowled, and the no-show: `count + 1` entries. */
const withNoShow = (count: number): Bowled[] => [...field(count), { entry: noShow, score: 0 }]

const summary = (changes: { change: string; name: string; squadId: string }[]) =>
  changes.map((change) => `${change.squadId.slice(-1)} ${change.change} ${change.name}`)

describe('workOutFallout: a casher drops out (20 entries to 19)', () => {
  const snapshot = snapshotOf([[squadOne, withNoShow(19)]])

  it('drops the second casher and nothing else', async () => {
    const result = await workOutFallout(snapshot, removal, [])

    expect(summary(result.changes)).toEqual(['1 losesCash Dee Lane'])
    expect(result.keepAdvancing).toEqual([])
    expect([...result.lostCash]).toEqual([`${squadOne.id}:${person(3).registrationId}`])
    expect(result.changedSquadIds).toEqual([squadOne.id])
  })

  it('ignores a "keep advancing" tick on a bowler who did not advance', async () => {
    const result = await workOutFallout(snapshot, removal, [keep(3)])

    expect(result.kept).toEqual([])
    expect(summary(result.changes)).toEqual(['1 losesCash Dee Lane'])
  })

  it('never names the no-show', async () => {
    const result = await workOutFallout(snapshot, removal, [])

    expect(result.changes.map((change) => change.name)).not.toContain('Nora Noshow')
  })
})

describe('workOutFallout: an advancer drops out (21 entries to 20)', () => {
  const snapshot = snapshotOf([[squadOne, withNoShow(20)]])

  it('turns the third advancer into a casher when not kept (NSH-20)', async () => {
    const result = await workOutFallout(snapshot, removal, [])

    expect(summary(result.changes).toSorted()).toEqual([
      '1 gainsCash Cal Lane',
      '1 losesAdvance Cal Lane',
    ])
    expect(result.keepAdvancing).toEqual([
      expect.objectContaining({ name: 'Cal Lane', squadId: squadOne.id, kept: false }),
    ])
  })

  it('changes nothing in the squad when kept: same advancers, same casher (NSH-21, NSH-22)', async () => {
    const result = await workOutFallout(snapshot, removal, [keep(2)])

    expect(result.changes).toEqual([])
    expect(result.kept).toEqual([keep(2)])
    expect(result.keepAdvancing).toEqual([
      expect.objectContaining({ name: 'Cal Lane', kept: true }),
    ])
    expect(result.lostCash.size).toBe(0)
  })

  it('moves the spot to at-large when not kept (RES-13)', async () => {
    const result = await workOutFallout(snapshot, removal, [])

    // 21 entries: 3 spots, 3 squad advancers. 20 entries: 2 spots, 2 advancers.
    expect(result.atLarge).toEqual([])
  })

  it('leaves an unticked bowler out of the finals when no at-large spot is left', async () => {
    const result = await workOutFallout(snapshot, removal, [])

    expect([...result.lostFinals]).toEqual([`${open.id}:${person(2).registrationId}`])
  })

  it('keeps a forced advancer in the finals with at-large at zero (NSH-23)', async () => {
    const result = await workOutFallout(snapshot, removal, [keep(2)])

    expect(result.lostFinals.size).toBe(0)
    expect(result.atLarge).toEqual([])
  })
})

describe('workOutFallout: later squads (RES-06, NSH-21)', () => {
  /** Cal advanced in squad one and bowls squad two again, with the best score there. */
  const second: Bowled[] = [{ entry: person(2), score: 280 }, ...field(13, 30)]
  const snapshot = snapshotOf([
    [squadOne, withNoShow(20)],
    [squadTwo, second],
  ])

  it('lets an unticked bowler advance later, which pushes another out', async () => {
    const result = await workOutFallout(snapshot, removal, [])

    // 14 entries in squad two: 2 advance. Cal now takes one, so Field31 does not.
    expect(summary(result.changes)).toEqual(
      expect.arrayContaining([
        '1 losesAdvance Cal Lane',
        '2 gainsAdvance Cal Lane',
        '2 losesAdvance Field31 Lane',
      ]),
    )
    expect(result.keepAdvancing.map((choice) => [choice.name, choice.kept])).toEqual([
      ['Cal Lane', false],
      ['Field31 Lane', false],
    ])
    expect(result.changedSquadIds).toEqual([squadOne.id, squadTwo.id])
  })

  it('leaves the later squad alone when ticked: a forced advancer cannot advance again', async () => {
    const result = await workOutFallout(snapshot, removal, [keep(2)])

    expect(result.changes).toEqual([])
    expect(result.keepAdvancing.map((choice) => choice.name)).toContain('Cal Lane')
  })

  it('drops a tick that another tick makes pointless', async () => {
    const result = await workOutFallout(snapshot, removal, [keep(2), keep(31, squadTwo.id)])

    expect(result.kept).toEqual([keep(2)])
  })

  it('does not offer to keep an advancer of a squad that is still open', async () => {
    const open = snapshotOf([
      [squadOne, withNoShow(20)],
      [{ ...openSquad, complete: false }, second],
    ])

    const result = await workOutFallout(open, removal, [keep(31, openSquad.id)])

    expect(result.kept).toEqual([])
    expect(result.keepAdvancing.map((choice) => choice.name)).toEqual(['Cal Lane'])
  })
})

describe('workOutFallout: nothing changes', () => {
  it('reports nothing when the entry count crosses no line', async () => {
    const result = await workOutFallout(snapshotOf([[squadOne, withNoShow(17)]]), removal, [])

    expect(result.changes).toEqual([])
    expect(result.atLarge).toEqual([])
    expect(result.keepAdvancing).toEqual([])
  })
})
