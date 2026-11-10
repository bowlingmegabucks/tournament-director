import { describe, expect, it } from 'vitest'
import { createScoreBowler, createScorePage, createScorePair } from '../../mocks/data'
import { describeScoreChange, diffScores } from './scoreDiff'

const named = (name: string, scores: (number | null)[]) =>
  createScoreBowler({ name, registrationId: `id-${name}`, scores })

const page = (...bowlers: ReturnType<typeof named>[]) =>
  createScorePage({ pairs: [createScorePair(1, bowlers)], other: [] })

describe('diffScores (SCR-18, D-237)', () => {
  it('finds no change when the scores are the same (our own save coming back)', () => {
    const same = page(named('Ann', [200, null]), named('Bob', [180, 190]))
    expect(diffScores(same, same)).toEqual({ ids: [], names: [], games: [] })
  })

  it('names the bowler and the game that changed', () => {
    const before = page(named('Ann', [200, null]), named('Bob', [180, 190]))
    const after = page(named('Ann', [200, 210]), named('Bob', [180, 190]))
    expect(diffScores(before, after)).toEqual({ ids: ['id-Ann'], names: ['Ann'], games: [2] })
  })

  it('counts a changed score, a cleared score, and a new score as changes', () => {
    const before = page(named('Ann', [200, 150]), named('Bob', [null, null]))
    const after = page(named('Ann', [201, null]), named('Bob', [170, null]))
    expect(diffScores(before, after)).toMatchObject({
      names: ['Ann', 'Bob'],
      games: [1, 2],
    })
  })

  it('lists the games once and in order for several bowlers', () => {
    const before = page(named('Ann', [null, null, null]), named('Bob', [null, null, null]))
    const after = page(named('Ann', [null, 100, 100]), named('Bob', [null, 90, null]))
    expect(diffScores(before, after).games).toEqual([2, 3])
  })

  it('counts a bowler new to the page when they hold a score, and not one with none', () => {
    const before = page(named('Ann', [200]))
    const after = page(named('Ann', [200]), named('Cy', [150]), named('Di', [null]))
    expect(diffScores(before, after).names).toEqual(['Cy'])
  })

  it('reads the "other positions" list too', () => {
    const before = createScorePage({ pairs: [], other: [named('Lost', [null])] })
    const after = createScorePage({ pairs: [], other: [named('Lost', [140])] })
    expect(diffScores(before, after).names).toEqual(['Lost'])
  })
})

describe('describeScoreChange (D-237)', () => {
  const change = (names: string[], games: number[]) => ({ ids: names, names, games })

  it('says nothing for no change', () => {
    expect(describeScoreChange(change([], []))).toBeUndefined()
  })

  it('names the bowlers and the game', () => {
    expect(describeScoreChange(change(['Dana Rivers', 'Lee Park'], [2]))).toBe(
      'Updated: Dana Rivers, Lee Park, game 2',
    )
  })

  it('says games for more than one', () => {
    expect(describeScoreChange(change(['Dana Rivers'], [1, 2]))).toBe(
      'Updated: Dana Rivers, games 1, 2',
    )
  })

  it('spells out three names and counts the rest', () => {
    expect(describeScoreChange(change(['A', 'B', 'C'], [1]))).toBe('Updated: A, B, C, game 1')
    expect(describeScoreChange(change(['A', 'B', 'C', 'D', 'E'], [1]))).toBe(
      'Updated: A, B, C and 2 more, game 1',
    )
  })
})
