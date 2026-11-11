import { describe, expect, it } from 'vitest'
import {
  createDivisionResult,
  createLiveResults,
  createSquadResults,
  createSuperSweeperResults,
  createSweeperResults,
} from '../../mocks/data'
import type { LiveEvent } from '../results/types'
import {
  formatClock,
  isUnofficial,
  noticeText,
  parseLiveEvent,
  replaceDivision,
  screenHeading,
  screensOf,
  screenThrough,
} from './liveLogic'

const squad = createSquadResults({
  session: { ...createSquadResults().session, id: 'sq1', date: '2026-10-24T09:00:00' },
  divisions: [
    createDivisionResult({ id: 'd1', name: 'Open', throughGame: 3 }),
    createDivisionResult({ id: 'd2', name: 'Senior', throughGame: 2 }),
  ],
})
const later = createSquadResults({
  session: {
    ...createSquadResults().session,
    id: 'sq2',
    date: '2026-10-24T13:00:00',
    complete: true,
  },
  divisions: [createDivisionResult({ id: 'd1', name: 'Open', throughGame: 3 })],
})
const sweeper = createSweeperResults({
  session: { ...createSweeperResults().session, id: 'sw1', date: '2026-10-24T18:00:00' },
  throughGame: 1,
})
const feed = createLiveResults({
  sessions: [
    { kind: 'squad', results: squad },
    { kind: 'squad', results: later },
    { kind: 'sweeper', results: sweeper },
  ],
  superSweeper: createSuperSweeperResults({ complete: false }),
})

describe('screensOf (D-242)', () => {
  it('lists each squad division, then each sweeper, then the super sweeper', () => {
    expect(screensOf(feed).map((screen) => screen.key)).toEqual([
      'sq1/d1',
      'sq1/d2',
      'sq2/d1',
      'sw1',
      'super-sweeper',
    ])
  })

  it('has no super sweeper screen when there is none, and no screen for no sessions', () => {
    expect(screensOf({ ...feed, superSweeper: null }).at(-1)?.key).toBe('sw1')
    expect(screensOf(createLiveResults())).toEqual([])
  })

  it('names the heading of each kind', () => {
    const screens = screensOf(feed)
    expect(screens.map(screenHeading)).toEqual([
      'Squad · Sat 10/24/2026 9:00 AM · Open',
      'Squad · Sat 10/24/2026 9:00 AM · Senior',
      'Squad · Sat 10/24/2026 1:00 PM · Open',
      'Sweeper · Sat 10/24/2026 6:00 PM',
      'Super sweeper',
    ])
  })

  it('says which screens are unofficial and which games each is ranked through (D-84, D-239)', () => {
    const screens = screensOf(feed)
    expect(screens.map(isUnofficial)).toEqual([true, true, false, true, true])
    expect(screens.map(screenThrough)).toEqual([3, 2, 3, 1, null])
    expect(
      isUnofficial({
        key: 's',
        kind: 'super-sweeper',
        results: createSuperSweeperResults({ complete: true }),
      }),
    ).toBe(false)
  })
})

describe('parseLiveEvent (RES-49, D-243)', () => {
  it('reads each kind with its detail', () => {
    expect(
      parseLiveEvent('game-full', {
        sessionId: 'sq1',
        sessionKind: 'squad',
        divisionId: 'd1',
        game: 3,
      }),
    ).toEqual({
      kind: 'game-full',
      detail: { sessionId: 'sq1', sessionKind: 'squad', divisionId: 'd1', game: 3 },
    })
    expect(
      parseLiveEvent('reopened', { sessionId: 'sq1', sessionKind: 'squad', divisionId: 'd1' }),
    ).toEqual({
      kind: 'reopened',
      detail: { sessionId: 'sq1', sessionKind: 'squad', divisionId: 'd1' },
    })
    expect(
      parseLiveEvent('game-full', {
        sessionId: 'sq1',
        sessionKind: 'squad',
        divisionId: 'd1',
        divisionName: 'Scratch',
        game: 1,
      })?.detail.divisionName,
    ).toBe('Scratch')
    expect(
      parseLiveEvent('game-full', {
        sessionId: 'sq1',
        sessionKind: 'squad',
        divisionName: 7,
      })?.detail,
    ).not.toHaveProperty('divisionName')
    expect(parseLiveEvent('complete', { sessionId: 'sw1', sessionKind: 'sweeper' })?.kind).toBe(
      'complete',
    )
  })

  it.each([
    ['a kind the TV does not handle', 'scores', { sessionId: 's', sessionKind: 'squad' }],
    ['no detail', 'game-full', undefined],
    ['a detail that is not an object', 'game-full', 'text'],
    ['a null detail', 'game-full', null],
    ['a detail with no session', 'game-full', { sessionKind: 'squad' }],
    ['a session kind that is neither', 'game-full', { sessionId: 's', sessionKind: 'lane' }],
  ])('gives nothing for %s', (_name, kind, detail) => {
    expect(parseLiveEvent(kind, detail)).toBeUndefined()
  })

  it('leaves out a division id or game that is the wrong type', () => {
    expect(
      parseLiveEvent('game-full', {
        sessionId: 's',
        sessionKind: 'squad',
        divisionId: 7,
        game: '3',
      })?.detail,
    ).toEqual({ sessionId: 's', sessionKind: 'squad' })
  })
})

describe('noticeText (D-245)', () => {
  const event = (over: Partial<LiveEvent['detail']> & { kind?: LiveEvent['kind'] }): LiveEvent => ({
    kind: over.kind ?? 'game-full',
    detail: { sessionId: 'sq1', sessionKind: 'squad', divisionId: 'd1', game: 3, ...over },
  })

  it('names the division and the game, with no squad', () => {
    expect(noticeText(event({}), feed)).toBe('Open Division – Game 3 complete')
    expect(noticeText(event({ divisionId: 'd2', game: 2 }), feed)).toBe(
      'Senior Division – Game 2 complete',
    )
  })

  it('uses the name the API sends, so a division not in the feed yet is still named', () => {
    expect(noticeText(event({ divisionId: 'new', divisionName: 'Scratch', game: 1 }), feed)).toBe(
      'Scratch Division – Game 1 complete',
    )
    expect(noticeText(event({ divisionName: 'Scratch' }), undefined)).toBe(
      'Scratch Division – Game 3 complete',
    )
  })

  it('does not say Division twice for a name that ends in it', () => {
    expect(noticeText(event({ divisionName: 'Open Division' }), feed)).toBe(
      'Open Division – Game 3 complete',
    )
    expect(noticeText(event({ divisionName: 'senior division' }), feed)).toBe(
      'senior division – Game 3 complete',
    )
  })

  it('names a sweeper without a division', () => {
    expect(
      noticeText(event({ sessionKind: 'sweeper', divisionId: undefined, game: 2 }), feed),
    ).toBe('Sweeper – Game 2 complete')
  })

  it('says a session is complete and official', () => {
    expect(noticeText(event({ kind: 'complete' }), feed)).toBe(
      'Session complete – results are official',
    )
  })

  it('says nothing for a reopened game (D-245)', () => {
    expect(noticeText(event({ kind: 'reopened' }), feed)).toBeUndefined()
  })

  it('says "Division" when the division is not in the feed yet, and nothing with no game', () => {
    expect(noticeText(event({ divisionId: 'new' }), feed)).toBe('Division – Game 3 complete')
    expect(noticeText(event({}), undefined)).toBe('Division – Game 3 complete')
    expect(noticeText(event({ game: undefined }), feed)).toBeUndefined()
  })
})

describe('replaceDivision (D-244)', () => {
  it('swaps one division of one squad and leaves the rest alone', () => {
    const changed = createDivisionResult({ id: 'd2', name: 'Senior', throughGame: 3, entries: 9 })

    const next = replaceDivision(feed, 'sq1', changed)

    const divisions = next?.sessions.flatMap((session) =>
      session.kind === 'squad'
        ? session.results.divisions.map((d) => [session.results.session.id, d.id, d.entries])
        : [],
    )
    expect(divisions).toEqual([
      ['sq1', 'd1', 0],
      ['sq1', 'd2', 9],
      ['sq2', 'd1', 0],
    ])
    expect(next?.sessions[2]).toBe(feed.sessions[2])
  })

  it('does not touch the same division id in another squad', () => {
    const changed = createDivisionResult({ id: 'd1', name: 'Open', entries: 5 })
    const next = replaceDivision(feed, 'sq1', changed)
    const second = next?.sessions[1]
    expect(second?.kind === 'squad' && second.results.divisions[0]?.entries).toBe(0)
  })

  it('gives nothing for a squad or division that is not in the feed, so the caller loads all', () => {
    expect(replaceDivision(feed, 'nope', createDivisionResult({ id: 'd1' }))).toBeUndefined()
    expect(replaceDivision(feed, 'sq1', createDivisionResult({ id: 'new' }))).toBeUndefined()
    expect(replaceDivision(feed, 'sw1', createDivisionResult({ id: 'd1' }))).toBeUndefined()
  })
})

describe('formatClock', () => {
  it('writes the time as "3:41 pm"', () => {
    const iso = new Date(2026, 9, 24, 15, 41).toISOString()
    expect(formatClock(iso)).toBe('3:41 pm')
    expect(formatClock(new Date(2026, 9, 24, 9, 5).toISOString())).toBe('9:05 am')
  })

  it('is empty for text that is not a time', () => {
    expect(formatClock('not a time')).toBe('')
  })
})
