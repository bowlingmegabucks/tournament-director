import { describe, expect, it } from 'vitest'
import {
  createGame,
  createGameBowler,
  createGamePair,
  createGamesView,
} from '../../mocks/gamesData'
import {
  applySaved,
  digitsOnly,
  findBowlers,
  firstOpenGame,
  gamesToFill,
  pairsInRange,
  priorGames,
  readScore,
  sayGames,
} from './entryLogic'

describe('digitsOnly (SCR-01, D-230)', () => {
  it('keeps digits and drops anything else', () => {
    expect(digitsOnly('2a1-2')).toBe('212')
    expect(digitsOnly('e')).toBe('')
    expect(digitsOnly(' 1 9 0 ')).toBe('190')
  })

  it('holds at most three digits, so a paste cannot make a long number', () => {
    expect(digitsOnly('123456')).toBe('123')
  })
})

describe('readScore (SCR-01)', () => {
  it('reads 1 to 300', () => {
    expect(readScore('1')).toEqual({ score: 1 })
    expect(readScore('212')).toEqual({ score: 212 })
    expect(readScore('300')).toEqual({ score: 300 })
  })

  it.each(['abc', '1.5', '-5', '2e', ' '])(
    'rejects text that is not a whole number: "%s"',
    (text) => {
      expect(readScore(text)).toEqual({ problem: 'Enter a score from 1 to 300.' })
    },
  )

  it.each(['', '0', '301', '999', '00'])('says what is wrong with "%s"', (text) => {
    expect(readScore(text)).toEqual({ problem: 'Enter a score from 1 to 300.' })
  })
})

describe('firstOpenGame (SCR-21)', () => {
  const bowler = (scores: (number | null)[]) =>
    createGameBowler({ scores, score: scores[0] ?? null })

  it('is the lowest game that misses a score', () => {
    const full = createGamePair(1, [bowler([200, 200, null])])
    const view = createGamesView({
      games: [
        createGame(1, [createGamePair(1, [createGameBowler({ score: 200 })])]),
        createGame(2, [createGamePair(1, [createGameBowler({ score: null })])]),
        createGame(3, [full]),
      ],
    })
    expect(firstOpenGame(view)).toBe(2)
  })

  it('is game 1 when every score is in, or when nobody has a lane', () => {
    const done = createGamesView({
      games: [createGame(1, [createGamePair(1, [createGameBowler({ score: 200 })])])],
    })
    expect(firstOpenGame(done)).toBe(1)
    expect(firstOpenGame(createGamesView({ games: [createGame(1), createGame(2)] }))).toBe(1)
  })
})

describe('pairsInRange (D-230)', () => {
  const pairs = [1, 3, 5, 7, 9].map((first) => createGamePair(first))
  const firsts = (range: { from: string; to: string }) =>
    pairsInRange(pairs, range).map((pair) => pair.firstLane)

  it('keeps the pairs with a lane inside the range', () => {
    expect(firsts({ from: '3', to: '6' })).toEqual([3, 5])
  })

  it('includes a pair when only one of its lanes is inside', () => {
    expect(firsts({ from: '4', to: '4' })).toEqual([3])
    expect(firsts({ from: '2', to: '2' })).toEqual([1])
  })

  it('treats an empty or unreadable end as open', () => {
    expect(firsts({ from: '', to: '' })).toEqual([1, 3, 5, 7, 9])
    expect(firsts({ from: '5', to: '' })).toEqual([5, 7, 9])
    expect(firsts({ from: '', to: '4' })).toEqual([1, 3])
    expect(firsts({ from: 'x', to: '4' })).toEqual([1, 3])
  })

  it('finds nothing for a range past every lane', () => {
    expect(firsts({ from: '41', to: '60' })).toEqual([])
  })
})

describe('findBowlers (D-230, D-236)', () => {
  const game = createGame(2, [
    createGamePair(1, [
      createGameBowler({
        registrationId: 'a',
        name: 'Dana Rivers',
        divisionName: 'Open',
        lane: '1A',
      }),
      createGameBowler({
        registrationId: 'b',
        name: 'Lee Park',
        divisionName: 'Senior',
        lane: '1B',
      }),
    ]),
    createGamePair(13, [
      createGameBowler({
        registrationId: 'c',
        name: 'Dana Parrish',
        divisionName: 'Open',
        lane: '13A',
      }),
    ]),
  ])

  it('finds nothing for nothing typed', () => {
    expect(findBowlers(game, '')).toEqual([])
    expect(findBowlers(game, '   ')).toEqual([])
  })

  it('matches the start of any word of the name, in any case', () => {
    expect(findBowlers(game, 'riv').map((hit) => hit.registrationId)).toEqual(['a'])
    expect(findBowlers(game, 'PARK').map((hit) => hit.registrationId)).toEqual(['b'])
  })

  it('needs every typed word to match, in any order', () => {
    expect(findBowlers(game, 'dana par').map((hit) => hit.registrationId)).toEqual(['c'])
    expect(findBowlers(game, 'rivers dana').map((hit) => hit.registrationId)).toEqual(['a'])
    expect(findBowlers(game, 'dana')).toHaveLength(2)
  })

  it('matches the division too', () => {
    expect(findBowlers(game, 'senior').map((hit) => hit.registrationId)).toEqual(['b'])
  })

  it('does not match the middle of a word', () => {
    expect(findBowlers(game, 'ivers')).toEqual([])
  })

  it('says the lane and the pair of the picked game', () => {
    expect(findBowlers(game, 'parrish')).toEqual([
      { registrationId: 'c', name: 'Dana Parrish', lane: '13A', firstLane: 13 },
    ])
  })
})

describe('gamesToFill and sayGames (D-229)', () => {
  const bowler = (scores: (number | null)[]) => createGameBowler({ scores })

  it('lists the empty games before the one being saved', () => {
    expect(gamesToFill(bowler([null, null, null]), 3)).toEqual([1, 2])
    expect(gamesToFill(bowler([200, null, null]), 3)).toEqual([2])
    expect(gamesToFill(bowler([null, 180, null]), 3)).toEqual([1])
  })

  it('lists none for game 1, or when earlier games hold a score, a 0 included', () => {
    expect(gamesToFill(bowler([null, null, null]), 1)).toEqual([])
    expect(gamesToFill(bowler([200, 0, null]), 3)).toEqual([])
  })

  it('does not count a game after the one being saved', () => {
    expect(gamesToFill(bowler([null, null, null]), 2)).toEqual([1])
  })

  it('says the games in words', () => {
    expect(sayGames([])).toBe('')
    expect(sayGames([1])).toBe('game 1')
    expect(sayGames([1, 2])).toBe('games 1 and 2')
    expect(sayGames([1, 2, 3])).toBe('games 1, 2 and 3')
  })
})

describe('priorGames (D-229)', () => {
  it('lists the other games that hold a score, a missed game marked', () => {
    const bowler = createGameBowler({ scores: [178, 0, null] })
    expect(priorGames(bowler, 3)).toBe('Game 1: 178 · Game 2: 0 · missed')
  })

  it('leaves out the game being entered and empty games', () => {
    const bowler = createGameBowler({ scores: [178, 190, null] })
    expect(priorGames(bowler, 2)).toBe('Game 1: 178')
    expect(priorGames(createGameBowler({ scores: [null, null, null] }), 1)).toBe('')
  })
})

describe('applySaved (SCR-19, D-229)', () => {
  const ann = createGameBowler({ registrationId: 'ann', scores: [null, null, null] })
  const bea = createGameBowler({ registrationId: 'bea', scores: [150, null, null], score: 150 })
  const view = createGamesView({
    games: [
      createGame(1, [createGamePair(1, [{ ...ann, score: null }, bea])]),
      createGame(2, [createGamePair(3, [{ ...ann, score: null }])]),
      createGame(3, [createGamePair(1, [{ ...ann, score: null }])]),
    ],
  })

  it('lays the answer over the bowler in every game they appear in, each with its own score', () => {
    const next = applySaved(view, 'ann', { scores: [0, 0, 167], total: 167 })

    const annIn = (game: number) =>
      next.games[game - 1]?.pairs
        .flatMap((pair) => pair.bowlers)
        .find((b) => b.registrationId === 'ann')
    expect(annIn(1)).toMatchObject({ score: 0, scores: [0, 0, 167], total: 167 })
    expect(annIn(2)).toMatchObject({ score: 0, total: 167 })
    expect(annIn(3)).toMatchObject({ score: 167 })
  })

  it('recounts how many are in for each game, a filled 0 included', () => {
    const next = applySaved(view, 'ann', { scores: [0, 0, 167], total: 167 })
    expect(next.games.map((game) => game.entered)).toEqual([2, 1, 1])
    expect(next.games.map((game) => game.total)).toEqual([2, 1, 1])
  })

  it('counts a cleared score as no longer in', () => {
    const saved = applySaved(view, 'ann', { scores: [180, null, null], total: 180 })
    const cleared = applySaved(saved, 'ann', { scores: [null, null, null], total: 0 })
    expect(cleared.games[0]?.entered).toBe(1)
  })

  it('leaves other bowlers and the original view alone', () => {
    const next = applySaved(view, 'ann', { scores: [200, null, null], total: 200 })
    const beaNow = next.games[0]?.pairs[0]?.bowlers.find((b) => b.registrationId === 'bea')
    expect(beaNow).toEqual(bea)
    expect(view.games[0]?.pairs[0]?.bowlers[0]?.score).toBeNull()
  })
})
