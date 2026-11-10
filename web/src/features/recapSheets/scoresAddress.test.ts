import { describe, expect, it } from 'vitest'
import { scoresAddress } from './scoresAddress'

describe('scoresAddress', () => {
  it('points at the Scores tab of a squad (RPT-10, D-226)', () => {
    expect(scoresAddress('https://example.com', 'squad', 't-1', 's-9')).toBe(
      'https://example.com/tournaments/t-1/squads/s-9/scores',
    )
  })

  it('points at the Scores tab of a sweeper (RPT-10, D-226)', () => {
    expect(scoresAddress('https://example.com', 'sweeper', 't-1', 'w-4')).toBe(
      'https://example.com/tournaments/t-1/sweepers/w-4/scores',
    )
  })
})
