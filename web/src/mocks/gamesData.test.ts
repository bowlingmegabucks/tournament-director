import { describe, expect, it } from 'vitest'
import { createDemoDivisions, createDemoSquads, createDemoSweepers } from './data'
import { createDemoGamesView, mockScoreChange } from './gamesData'

describe('mockScoreChange (SCR-01, SCR-03, D-229, D-238)', () => {
  const empty = [null, null, null]

  it('saves a score and fills the empty games before it with 0', () => {
    expect(mockScoreChange(empty, 3, 3, 167, false)).toEqual({ status: 200, scores: [0, 0, 167] })
    expect(mockScoreChange([200, null, null], 3, 3, 150, false)).toEqual({
      status: 200,
      scores: [200, 0, 150],
    })
  })

  it('replaces a score and leaves games after it alone', () => {
    expect(mockScoreChange([0, 180, null], 3, 1, 190, false)).toEqual({
      status: 200,
      scores: [190, 180, null],
    })
  })

  it('refuses 0, 301, a fraction, and a game outside the session', () => {
    for (const score of [0, 301, 1.5]) {
      expect(mockScoreChange(empty, 3, 1, score, false)).toEqual({
        status: 400,
        message: 'Enter a score from 1 to 300.',
      })
    }
    for (const game of [0, 4]) {
      expect(mockScoreChange(empty, 3, game, 200, false)).toEqual({
        status: 400,
        message: 'Game must be from 1 to 3.',
      })
    }
  })

  it('refuses a complete session', () => {
    expect(mockScoreChange(empty, 3, 1, 200, true)).toMatchObject({ status: 409 })
    expect(mockScoreChange([200, null, null], 3, 1, null, true)).toMatchObject({ status: 409 })
  })

  it('clears from the last game back, and says when there is nothing to clear', () => {
    expect(mockScoreChange([200, 190, null], 3, 2, null, false)).toEqual({
      status: 200,
      scores: [200, null, null],
    })
    expect(mockScoreChange([200, 190, null], 3, 1, null, false)).toEqual({
      status: 409,
      message: 'Clear game 2 first.',
    })
    expect(mockScoreChange(empty, 3, 1, null, false)).toEqual({
      status: 404,
      message: 'No score to clear.',
    })
  })
})

describe('createDemoGamesView (SCR-22)', () => {
  const divisions = createDemoDivisions()
  const squad = createDemoSquads().find((entry) => !entry.complete)
  const sweeper = createDemoSweepers(divisions)[0]

  it('lists every game with the pairs as bowled, in lane order', () => {
    if (!squad) throw new Error('No open demo squad')
    const view = createDemoGamesView('squad', squad, divisions, 'staggered', undefined)

    expect(view.games.map((game) => game.game)).toEqual([1, 2, 3])
    for (const game of view.games) {
      expect(game.pairs.map((pair) => pair.firstLane)).toEqual(
        game.pairs.map((pair) => pair.firstLane).toSorted((a, b) => a - b),
      )
      expect(game.total).toBe(game.pairs.flatMap((pair) => pair.bowlers).length)
    }
  })

  it('puts a bowler on another lane in a later game, and follows the skip', () => {
    if (!squad) throw new Error('No open demo squad')
    const staggered = createDemoGamesView('squad', squad, divisions, 'staggered', undefined)
    const same = createDemoGamesView('squad', squad, divisions, 'same', undefined)
    const lanes = (view: typeof staggered) =>
      view.games.flatMap((game) => game.pairs.flatMap((pair) => pair.bowlers.map((b) => b.lane)))

    expect(lanes(staggered)).not.toEqual(lanes(same))
    expect(staggered.skip).toBe('staggered')
    expect(same.skip).toBe('same')
  })

  it('shows saved scores over the demo scores', () => {
    if (!squad) throw new Error('No open demo squad')
    const base = createDemoGamesView('squad', squad, divisions, 'staggered', undefined)
    const target = base.games[0]?.pairs[0]?.bowlers.at(-1)
    if (!target) throw new Error('No bowler')

    const view = createDemoGamesView(
      'squad',
      squad,
      divisions,
      'staggered',
      new Map([[target.registrationId, [211, 222, 233]]]),
    )

    const found = view.games[1]?.pairs
      .flatMap((pair) => pair.bowlers)
      .find((bowler) => bowler.registrationId === target.registrationId)
    expect(found).toMatchObject({ score: 222, scores: [211, 222, 233], total: 666 })
  })

  it('builds a sweeper too', () => {
    if (!sweeper) throw new Error('No demo sweeper')
    const view = createDemoGamesView('sweeper', sweeper, divisions, 'staggered', undefined)
    expect(view.session.kind).toBe('sweeper')
  })
})
