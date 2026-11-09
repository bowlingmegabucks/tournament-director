import { describe, expect, it } from 'vitest'
import { reasonsFor } from './refusalReasons'

describe('reasonsFor', () => {
  it('lists the reasons in the order of the keys, skipping others', () => {
    const errors = { scores: 'Has scores.', other: 'Ignored.', tournament: 'Complete.' }
    expect(reasonsFor(errors, ['tournament', 'session', 'scores'], 'fallback')).toEqual([
      'Complete.',
      'Has scores.',
    ])
  })

  it('skips a reason that is not text', () => {
    expect(reasonsFor({ tournament: 3 }, ['tournament'], 'fallback')).toEqual(['fallback'])
  })

  it('gives the fallback when nothing matches or errors is not an object', () => {
    expect(reasonsFor({}, ['tournament'], 'fallback')).toEqual(['fallback'])
    expect(reasonsFor(undefined, ['tournament'], 'fallback')).toEqual(['fallback'])
  })
})
