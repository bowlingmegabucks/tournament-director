import { describe, expect, it } from 'vitest'
import { retryUnlessNotFound, tournamentKeys, TournamentNotFoundError } from './tournamentQuery'

describe('TournamentNotFoundError', () => {
  it('says the tournament was not found', () => {
    expect(new TournamentNotFoundError().message).toBe('Tournament not found')
  })
})

describe('tournamentKeys', () => {
  it('keys the list and one tournament apart', () => {
    expect(tournamentKeys.all).toEqual(['tournaments'])
    expect(tournamentKeys.detail('abc')).toEqual(['tournaments', 'abc'])
  })
})

describe('retryUnlessNotFound', () => {
  it('retries a failure once', () => {
    expect(retryUnlessNotFound(0, new Error('boom'))).toBe(true)
    expect(retryUnlessNotFound(1, new Error('boom'))).toBe(false)
  })

  it('never retries a missing tournament', () => {
    expect(retryUnlessNotFound(0, new TournamentNotFoundError())).toBe(false)
  })
})
