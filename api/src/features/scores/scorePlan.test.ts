import { describe, expect, it } from 'vitest'
import { planChange, planClear, planSave, totalOf, type ScoreFacts } from './scorePlan.ts'

function facts(overrides: Partial<ScoreFacts> = {}): ScoreFacts {
  return {
    kind: 'squad',
    tournamentComplete: false,
    sessionComplete: false,
    games: 3,
    stored: [],
    ...overrides,
  }
}

describe('planSave', () => {
  it('saves one score and fills nothing for game 1 (SCR-01, SCR-19)', () => {
    expect(planSave(facts(), 1, 212)).toEqual({
      type: 'save',
      writes: [{ game: 1, score: 212 }],
      filled: [],
      scores: [212, null, null],
    })
  })

  it('accepts 1 and 300 and refuses 0, 301, a fraction, and not a number (SCR-01)', () => {
    expect(planSave(facts(), 1, 1).type).toBe('save')
    expect(planSave(facts(), 1, 300).type).toBe('save')
    for (const score of [0, 301, -5, 212.5, Number.NaN, Infinity]) {
      expect(planSave(facts(), 1, score)).toEqual({
        type: 'invalid',
        message: 'Enter a score from 1 to 300.',
      })
    }
  })

  it('refuses a game below 1, above the session games, or not whole (SCR-02, D-238)', () => {
    for (const game of [0, -1, 4, 1.5, Number.NaN]) {
      expect(planSave(facts(), game, 200)).toEqual({
        type: 'invalid',
        message: 'Game must be from 1 to 3.',
      })
    }
    expect(planSave(facts({ games: 6 }), 6, 200).type).toBe('save')
  })

  it('names the session games in the message (D-238)', () => {
    expect(planSave(facts({ games: 2 }), 3, 200)).toMatchObject({
      message: 'Game must be from 1 to 2.',
    })
  })

  it('fills earlier empty games with 0 in the same save (SCR-03, D-229)', () => {
    const plan = planSave(facts(), 3, 167)
    expect(plan).toEqual({
      type: 'save',
      writes: [
        { game: 1, score: 0 },
        { game: 2, score: 0 },
        { game: 3, score: 167 },
      ],
      filled: [1, 2],
      scores: [0, 0, 167],
    })
  })

  it('fills only the empty games, and keeps a stored score (SCR-03, D-229)', () => {
    const plan = planSave(facts({ stored: [{ game: 2, score: 180 }] }), 3, 190)
    expect(plan).toMatchObject({ filled: [1], scores: [0, 180, 190] })
    expect(plan.type === 'save' && plan.writes).toEqual([
      { game: 1, score: 0 },
      { game: 3, score: 190 },
    ])
  })

  it('replaces a filled 0 with a real score and fills nothing (D-229)', () => {
    const plan = planSave(
      facts({
        stored: [
          { game: 1, score: 0 },
          { game: 2, score: 0 },
          { game: 3, score: 167 },
        ],
      }),
      1,
      190,
    )
    expect(plan).toEqual({
      type: 'save',
      writes: [{ game: 1, score: 190 }],
      filled: [],
      scores: [190, 0, 167],
    })
  })

  it('updates a game that has a different score (SCR-04)', () => {
    const plan = planSave(facts({ stored: [{ game: 1, score: 150 }] }), 1, 160)
    expect(plan).toMatchObject({
      type: 'save',
      writes: [{ game: 1, score: 160 }],
      scores: [160, null, null],
    })
  })

  it('changes nothing for the same score again (SCR-04)', () => {
    expect(planSave(facts({ stored: [{ game: 1, score: 150 }] }), 1, 150)).toEqual({
      type: 'unchanged',
      scores: [150, null, null],
    })
  })

  it('still writes a score for a game after a stored game it fills before (SCR-04)', () => {
    // Game 2 stored; saving game 1 first is a plain write with no fill.
    const plan = planSave(facts({ stored: [{ game: 2, score: 170 }] }), 1, 140)
    expect(plan).toMatchObject({ filled: [], scores: [140, 170, null] })
  })

  it('refuses a complete session and says which kind (SCR-14, D-231)', () => {
    expect(planSave(facts({ sessionComplete: true }), 1, 200)).toEqual({
      type: 'refused',
      message: 'This squad is complete. Scores cannot change.',
    })
    expect(planSave(facts({ kind: 'sweeper', sessionComplete: true }), 1, 200)).toEqual({
      type: 'refused',
      message: 'This sweeper is complete. Scores cannot change.',
    })
  })

  it('refuses a complete tournament first, even for a bad score (SCR-14, D-231)', () => {
    expect(planSave(facts({ tournamentComplete: true }), 1, 999)).toEqual({
      type: 'refused',
      message: 'This tournament is complete. Scores cannot change.',
    })
  })

  it('writes only the games it names, so no other score is touched (SCR-05, SCR-06, D-228)', () => {
    const plan = planSave(
      facts({
        stored: [
          { game: 1, score: 150 },
          { game: 2, score: 160 },
        ],
      }),
      3,
      170,
    )
    expect(plan.type === 'save' && plan.writes).toEqual([{ game: 3, score: 170 }])
  })

  it('ignores a stored game above the count when it reads the columns (D-238)', () => {
    const plan = planSave(facts({ stored: [{ game: 5, score: 250 }] }), 1, 100)
    expect(plan).toMatchObject({ scores: [100, null, null] })
  })
})

describe('planClear', () => {
  const stored = [
    { game: 1, score: 150 },
    { game: 2, score: 160 },
    { game: 3, score: 170 },
  ]

  it('clears the last game (SCR-06, D-228)', () => {
    expect(planClear(facts({ stored }), 3)).toEqual({
      type: 'clear',
      game: 3,
      scores: [150, 160, null],
    })
  })

  it('refuses a clear that would leave a gap, and names the game to clear first (D-229)', () => {
    expect(planClear(facts({ stored }), 1)).toEqual({
      type: 'refused',
      message: 'Clear game 3 first.',
    })
    expect(planClear(facts({ stored: stored.slice(0, 2) }), 1)).toMatchObject({
      message: 'Clear game 2 first.',
    })
  })

  it('clears a game that is only followed by empty games (D-229)', () => {
    const plan = planClear(facts({ stored: stored.slice(0, 2) }), 2)
    expect(plan).toEqual({ type: 'clear', game: 2, scores: [150, null, null] })
  })

  it('says there is no score to clear when the game is empty (SCR-19)', () => {
    expect(planClear(facts({ stored: stored.slice(0, 1) }), 2)).toEqual({
      type: 'missing',
      message: 'No score to clear.',
    })
  })

  it('can clear a filled 0 (D-229)', () => {
    const plan = planClear(facts({ stored: [{ game: 1, score: 0 }] }), 1)
    expect(plan).toMatchObject({ type: 'clear', scores: [null, null, null] })
  })

  it('refuses a game that is out of range (SCR-02, D-238)', () => {
    expect(planClear(facts({ stored }), 0)).toMatchObject({ type: 'invalid' })
    expect(planClear(facts({ stored }), 4)).toMatchObject({
      type: 'invalid',
      message: 'Game must be from 1 to 3.',
    })
  })

  it('refuses a complete session and tournament (SCR-14, D-231)', () => {
    expect(planClear(facts({ stored, sessionComplete: true }), 3)).toEqual({
      type: 'refused',
      message: 'This squad is complete. Scores cannot change.',
    })
    expect(planClear(facts({ stored, tournamentComplete: true }), 3)).toEqual({
      type: 'refused',
      message: 'This tournament is complete. Scores cannot change.',
    })
  })
})

describe('planChange', () => {
  it('saves when there is a score and clears when there is none (D-228)', () => {
    const stored = [{ game: 1, score: 150 }]
    expect(planChange(facts({ stored }), { game: 1, score: 160 })).toEqual(
      planSave(facts({ stored }), 1, 160),
    )
    expect(planChange(facts({ stored }), { game: 1 })).toEqual(planClear(facts({ stored }), 1))
  })
})

describe('totalOf', () => {
  it('adds the scores present and counts none as 0 (D-68)', () => {
    expect(totalOf([200, null, 150])).toBe(350)
    expect(totalOf([null, null])).toBe(0)
    expect(totalOf([0, 0, 167])).toBe(167)
  })
})
