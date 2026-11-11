import { describe, expect, it } from 'vitest'
import { toResultEntry, type ResultEntry } from './entries.ts'
import { countedGames, limitToCountedGames } from './fullGame.ts'

let next = 0
/** An entry with these scores by game number; `null` is a game with no saved score. */
function entry(scores: (number | null)[], over: Partial<ResultEntry> = {}): ResultEntry {
  next += 1
  return toResultEntry({
    registrationId: `reg-${next}`,
    bowlerId: `bowler-${next}`,
    firstName: 'A',
    lastName: 'B',
    name: 'A B',
    divisionId: 'open',
    divisionName: 'Open',
    games: scores.filter((score): score is number => score !== null),
    gameScores: scores,
    pins: 0,
    ...over,
  })
}

const none = new Set<string>()

describe('countedGames (RES-40)', () => {
  it('is the fewest games any entry has', () => {
    const entries = [entry([200, 200, 200]), entry([200, 200, 200, 200]), entry([200, 200, 200])]
    expect(countedGames(entries, none)).toBe(3)
  })

  it('is the shortest bowler when only some have the newest game', () => {
    expect(countedGames([entry([200, 200]), entry([200, 200, 200, 200])], none)).toBe(2)
  })

  it('has no answer for no entries', () => {
    expect(countedGames([], none)).toBeUndefined()
  })

  it('ends a bowler’s run at a game with no saved score', () => {
    expect(countedGames([entry([200, null, 200]), entry([200, 200, 200])], none)).toBe(1)
  })

  it('counts a game when every entry has it', () => {
    expect(countedGames([entry([200, 200, 200]), entry([200, 200, 200])], none)).toBe(3)
  })
})

describe('countedGames and the DNF flag (RES-55)', () => {
  it('leaves a flagged entry out of the fewest', () => {
    const walked = entry([200, 200])
    const entries = [walked, entry([200, 200, 200]), entry([200, 200, 200])]
    expect(countedGames(entries, new Set([walked.registrationId]))).toBe(3)
  })

  it('leaves no one out when every entry is flagged', () => {
    const a = entry([200, 200])
    const b = entry([200, 200, 200])
    expect(countedGames([a, b], new Set([a.registrationId, b.registrationId]))).toBe(2)
  })

  it('ignores a flag on a registration that is not in the group', () => {
    expect(countedGames([entry([200, 200])], new Set(['someone-else']))).toBe(2)
  })
})

describe('limitToCountedGames (RES-40)', () => {
  const byDivision = (e: ResultEntry) => e.divisionId

  it('cuts the total, high game, and best games to the counted games', () => {
    const fast = entry([200, 210, 220, 300])
    const slow = entry([190, 190, 190])

    const { entries, through } = limitToCountedGames([fast, slow], byDivision, none)

    expect(through.get('open')).toBe(3)
    expect(entries[0]).toMatchObject({ total: 630, highGame: 220, best: [220, 210, 200] })
    expect(entries[0]?.games).toEqual([200, 210, 220])
  })

  it('keeps every saved game in gameScores, so the page can dim the rest', () => {
    const { entries } = limitToCountedGames(
      [entry([200, 210, 220, 300]), entry([190, 190, 190])],
      byDivision,
      none,
    )
    expect(entries[0]?.gameScores).toEqual([200, 210, 220, 300])
  })

  it('counts each group on its own', () => {
    const open = entry([200, 200, 200], { divisionId: 'open' })
    const senior = entry([200], { divisionId: 'senior' })
    const { through, entries } = limitToCountedGames([open, senior], byDivision, none)
    expect(through.get('open')).toBe(3)
    expect(through.get('senior')).toBe(1)
    expect(entries[0]?.total).toBe(600)
  })

  it('treats a sweeper as one group', () => {
    const { through } = limitToCountedGames(
      [entry([200, 200], { divisionId: 'a' }), entry([200], { divisionId: 'b' })],
      () => 'sweeper',
      none,
    )
    expect(through.get('sweeper')).toBe(1)
  })

  it('keeps a flagged bowler’s own games and does not hold the others back', () => {
    const walked = entry([200, 200])
    const { entries, through } = limitToCountedGames(
      [walked, entry([210, 210, 210]), entry([220, 220, 220])],
      byDivision,
      new Set([walked.registrationId]),
    )
    expect(through.get('open')).toBe(3)
    expect(entries[0]?.games).toEqual([200, 200])
    expect(entries[1]?.total).toBe(630)
  })

  it('leaves a game with no saved score out of a flagged bowler\u2019s games', () => {
    const gappy = entry([200, null, 200])
    const { entries } = limitToCountedGames(
      [gappy, entry([210, 210, 210])],
      byDivision,
      new Set([gappy.registrationId]),
    )
    expect(entries[0]?.games).toEqual([200, 200])
    expect(entries[0]?.total).toBe(400)
  })

  it('adds the pins for each counted game only', () => {
    const { entries } = limitToCountedGames(
      [entry([200, 200, 200], { pins: 10 }), entry([200, 200], { pins: 0 })],
      byDivision,
      none,
    )
    expect(entries[0]).toMatchObject({ total: 420, highGame: 210 })
  })

  it('returns no entries and no counts for no entries', () => {
    const { entries, through } = limitToCountedGames([], byDivision, none)
    expect(entries).toEqual([])
    expect(through.size).toBe(0)
  })

  it('keeps the entries in their order', () => {
    const a = entry([200, 200])
    const b = entry([200, 200])
    const { entries } = limitToCountedGames([b, a], byDivision, none)
    expect(entries.map((e) => e.registrationId)).toEqual([b.registrationId, a.registrationId])
  })
})

describe('waiting bowlers: entered, no score yet (RES-40)', () => {
  const waiter = (id: string, divisionId = 'open') => ({ registrationId: id, divisionId })

  it('hold a group at 0 until they bowl, without being in the answer', () => {
    const scored = [entry([200]), entry([190])]

    const { entries, through } = limitToCountedGames(scored, (item) => item.divisionId, none, [
      waiter('late'),
    ])

    expect(through.get('open')).toBe(0)
    expect(entries).toHaveLength(2)
    expect(entries.map((item) => item.total)).toEqual([0, 0])
  })

  it('hold only their own group', () => {
    const open = entry([200])
    const senior = entry([200], { divisionId: 'senior', divisionName: 'Senior' })

    const { through } = limitToCountedGames([open, senior], (item) => item.divisionId, none, [
      waiter('late', 'senior'),
    ])

    expect(through.get('open')).toBe(1)
    expect(through.get('senior')).toBe(0)
  })

  it('do not hold a group back once flagged DNF', () => {
    const { through } = limitToCountedGames(
      [entry([200])],
      (item) => item.divisionId,
      new Set(['late']),
      [waiter('late')],
    )

    expect(through.get('open')).toBe(1)
  })

  it('count as bowlers who have bowled nothing in countedGames', () => {
    expect(countedGames([entry([200, 200])], none, [{ registrationId: 'late' }])).toBe(0)
    expect(countedGames([entry([200, 200])], none, [])).toBe(2)
  })

  it('can name their group their own way (a sweeper is one group)', () => {
    const { through } = limitToCountedGames(
      [entry([200])],
      () => 'sweeper',
      none,
      [waiter('late', 'anything')],
      () => 'sweeper',
    )

    expect(through.get('sweeper')).toBe(0)
  })
})
