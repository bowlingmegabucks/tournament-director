import { describe, expect, it } from 'vitest'
import { deciderSchema, divisionResultSchema, tieSchema } from './types.ts'

describe('results schemas', () => {
  it.each([
    [{ kind: 'games' }, true],
    [{ kind: 'game', rank: 1 }, true],
    [{ kind: 'game', rank: 3 }, true],
    [{ kind: 'game', rank: 0 }, false],
    [{ kind: 'game', rank: 1.5 }, false],
    [{ kind: 'game' }, false],
    [{ kind: 'luck' }, false],
  ])('reads the tie-breaker %j as valid: %s', (value, valid) => {
    expect(deciderSchema.safeParse(value).success).toBe(valid)
  })

  it('reads a full tie with no tie-breaker (D-16)', () => {
    expect(tieSchema.safeParse({ line: 'cut', outcome: 'full', decidedBy: null }).success).toBe(
      true,
    )
  })

  it.each([
    [{ line: 'top', outcome: 'won', decidedBy: null }],
    [{ line: 'cut', outcome: 'drew', decidedBy: null }],
    [{ line: 'cut', outcome: 'won' }],
  ])('rejects the tie %j', (value) => {
    expect(tieSchema.safeParse(value).success).toBe(false)
  })

  it('needs a name for a no-show', () => {
    const base = {
      id: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a01',
      number: 1,
      name: 'Open',
      entries: 1,
      showHandicap: false,
      showGames: false,
      rows: [],
      didNotFinish: [],
    }
    const noShow = (name: string) => ({
      ...base,
      noShows: [{ registrationId: '7c1e0a52-3f55-4c0e-9a5b-1d2f6b8e4a02', name }],
    })

    expect(divisionResultSchema.safeParse(noShow('Mike Tran')).success).toBe(true)
    expect(divisionResultSchema.safeParse(noShow('')).success).toBe(false)
    expect(divisionResultSchema.safeParse(noShow('Mike Tran, Jr')).success).toBe(true)
  })
})
