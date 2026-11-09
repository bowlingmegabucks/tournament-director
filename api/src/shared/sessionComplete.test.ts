import { describe, expect, it } from 'vitest'
import {
  alreadyCompleteMessage,
  applySessionComplete,
  noShowBowlers,
  planSessionComplete,
  squadCompleteInfo,
  zeroScores,
} from './sessionComplete.ts'

const open = { completed: false, complete: false }

describe('planSessionComplete (SQD-15, SQD-16, SQD-18, D-192)', () => {
  it('completes an open session in an open tournament, empty or not', () => {
    expect(planSessionComplete(open, 'squad')).toEqual({ kind: 'complete' })
    expect(planSessionComplete(open, 'sweeper')).toEqual({ kind: 'complete' })
  })

  it('refuses a complete tournament (SQD-17, D-130)', () => {
    expect(planSessionComplete({ ...open, completed: true }, 'squad')).toEqual({
      kind: 'refused',
      errors: { tournament: 'This tournament is complete and cannot be changed' },
    })
  })

  it('refuses a session that is already complete, naming the kind (SQD-18)', () => {
    expect(planSessionComplete({ ...open, complete: true }, 'squad')).toEqual({
      kind: 'refused',
      errors: { session: 'This squad is already complete' },
    })
    expect(alreadyCompleteMessage('sweeper')).toBe('This sweeper is already complete')
  })

  it('lists every reason, the tournament first', () => {
    const plan = planSessionComplete({ completed: true, complete: true }, 'sweeper')

    expect(plan.kind === 'refused' && Object.keys(plan.errors)).toEqual(['tournament', 'session'])
  })
})

describe('noShowBowlers (SQD-15, D-06, D-75)', () => {
  it('picks the bowlers with no saved game and leaves partial and full ones alone', () => {
    const entries = [
      { bowlerId: 'none', savedGames: 0 },
      { bowlerId: 'some', savedGames: 2 },
      { bowlerId: 'all', savedGames: 3 },
    ]

    expect(noShowBowlers(entries)).toEqual(['none'])
  })

  it('counts a bowler with two registrations once, and not as a no-show when either has games', () => {
    expect(
      noShowBowlers([
        { bowlerId: 'a', savedGames: 0 },
        { bowlerId: 'a', savedGames: 0 },
        { bowlerId: 'b', savedGames: 0 },
        { bowlerId: 'b', savedGames: 1 },
      ]),
    ).toEqual(['a'])
  })

  it('gives nobody for no entries', () => {
    expect(noShowBowlers([])).toEqual([])
  })
})

describe('zeroScores (SQD-15)', () => {
  it('lists game 1 to games for each bowler', () => {
    expect(zeroScores(['a', 'b'], 3)).toEqual([
      { bowlerId: 'a', game: 1 },
      { bowlerId: 'a', game: 2 },
      { bowlerId: 'a', game: 3 },
      { bowlerId: 'b', game: 1 },
      { bowlerId: 'b', game: 2 },
      { bowlerId: 'b', game: 3 },
    ])
  })

  it('lists nothing for nobody', () => {
    expect(zeroScores([], 3)).toEqual([])
  })
})

describe('squadCompleteInfo (D-194)', () => {
  it('counts entries, no-shows, and bowlers short of the games', () => {
    const entries = [
      { bowlerId: 'a', savedGames: 0 },
      { bowlerId: 'b', savedGames: 0 },
      { bowlerId: 'c', savedGames: 1 },
      { bowlerId: 'd', savedGames: 3 },
    ]

    expect(squadCompleteInfo(entries, 3)).toEqual({
      entryCount: 4,
      noScoreCount: 2,
      partialCount: 1,
      games: 3,
    })
  })

  it('counts a bowler with more games than the squad plays as done', () => {
    expect(squadCompleteInfo([{ bowlerId: 'a', savedGames: 4 }], 3).partialCount).toBe(0)
  })

  it('counts a bowler once however many registrations', () => {
    expect(
      squadCompleteInfo(
        [
          { bowlerId: 'a', savedGames: 0 },
          { bowlerId: 'a', savedGames: 0 },
        ],
        3,
      ),
    ).toMatchObject({ entryCount: 1, noScoreCount: 1 })
  })
})

describe('applySessionComplete (SQD-15, SQD-16)', () => {
  const entries = [
    { bowlerId: 'none', savedGames: 0 },
    { bowlerId: 'all', savedGames: 3 },
  ]

  it('persists the no-shows of a squad and reports how many', async () => {
    let saved: string[] | undefined
    const result = await applySessionComplete(open, 'squad', entries, (noShows) => {
      saved = noShows
      return Promise.resolve()
    })

    expect(result).toEqual({ noShowCount: 1 })
    expect(saved).toEqual(['none'])
  })

  it('zeroes nobody for a sweeper, whoever is entered (SQD-16)', async () => {
    let saved: string[] | undefined
    const result = await applySessionComplete(open, 'sweeper', entries, (noShows) => {
      saved = noShows
      return Promise.resolve()
    })

    expect(result).toEqual({ noShowCount: 0 })
    expect(saved).toEqual([])
  })

  it('persists nothing when refused', async () => {
    let called = false
    const result = await applySessionComplete({ ...open, complete: true }, 'squad', entries, () => {
      called = true
      return Promise.resolve()
    })

    expect(result).toEqual({ refused: { session: 'This squad is already complete' } })
    expect(called).toBe(false)
  })
})
