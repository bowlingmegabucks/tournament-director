import { describe, expect, it } from 'vitest'
import { createTournament } from '../../mocks/data'
import { currentTournament, groupTournaments, tournamentStatus } from './groupTournaments'

const today = '2026-10-21'
const t = (startDate: string, endDate: string, name = startDate) =>
  createTournament({ startDate, endDate, name })

describe('tournamentStatus', () => {
  it.each([
    ['ends today', '2026-10-19', '2026-10-21', 'in-progress'],
    ['starts today', '2026-10-21', '2026-10-23', 'in-progress'],
    ['started yesterday', '2026-10-20', '2026-10-22', 'in-progress'],
    ['starts tomorrow', '2026-10-22', '2026-10-24', 'upcoming'],
    ['ended yesterday', '2026-10-18', '2026-10-20', 'past'],
    ['one day today', '2026-10-21', '2026-10-21', 'in-progress'],
  ] as const)('%s is %s (TRN-13)', (_label, start, end, expected) => {
    expect(tournamentStatus(t(start, end), today)).toBe(expected)
  })
})

describe('groupTournaments', () => {
  it('counts a tournament that ends today as current (TRN-13)', () => {
    const endsToday = t('2026-10-19', '2026-10-21')

    expect(groupTournaments([endsToday], today)).toEqual({ current: [endsToday], past: [] })
  })

  it('counts a tournament that ended yesterday as past (TRN-13)', () => {
    const ended = t('2026-10-18', '2026-10-20')

    expect(groupTournaments([ended], today)).toEqual({ current: [], past: [ended] })
  })

  it('sorts current soonest first (TRN-13)', () => {
    const later = t('2027-01-10', '2027-01-12', 'later')
    const sooner = t('2026-10-23', '2026-10-25', 'sooner')
    const running = t('2026-10-20', '2026-10-22', 'running')

    const { current } = groupTournaments([later, sooner, running], today)

    expect(current.map((x) => x.name)).toEqual(['running', 'sooner', 'later'])
  })

  it('sorts past newest first (TRN-13)', () => {
    const oldest = t('2023-10-13', '2023-10-15', 'oldest')
    const newest = t('2025-10-10', '2025-10-12', 'newest')
    const middle = t('2024-10-11', '2024-10-13', 'middle')

    const { past } = groupTournaments([oldest, newest, middle], today)

    expect(past.map((x) => x.name)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('handles a range across a year end (TRN-13)', () => {
    const acrossYears = t('2025-12-30', '2026-01-02')

    expect(groupTournaments([acrossYears], '2026-01-02').current).toEqual([acrossYears])
    expect(groupTournaments([acrossYears], '2026-01-03').past).toEqual([acrossYears])
  })

  it('returns two empty groups for no tournaments', () => {
    expect(groupTournaments([], today)).toEqual({ current: [], past: [] })
  })

  it('does not change the list it was given', () => {
    const list = [t('2027-01-10', '2027-01-12'), t('2026-10-23', '2026-10-25')]
    const copy = [...list]

    groupTournaments(list, today)

    expect(list).toEqual(copy)
  })
})

describe('currentTournament', () => {
  it('prefers one in progress over one upcoming (TRN-14)', () => {
    const running = t('2026-10-20', '2026-10-22', 'running')
    const upcoming = t('2026-10-30', '2026-11-01', 'upcoming')

    expect(currentTournament([upcoming, running], today)).toBe(running)
  })

  it('picks the first upcoming when none is running (TRN-14)', () => {
    const next = t('2026-10-30', '2026-11-01', 'next')
    const later = t('2027-02-01', '2027-02-03', 'later')

    expect(currentTournament([later, next], today)).toBe(next)
  })

  it('returns nothing when all are past (TRN-14)', () => {
    expect(currentTournament([t('2025-10-10', '2025-10-12')], today)).toBeUndefined()
  })

  it('returns nothing for an empty list (TRN-14)', () => {
    expect(currentTournament([], today)).toBeUndefined()
  })
})
