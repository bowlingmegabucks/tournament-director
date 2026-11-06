import { describe, expect, it } from 'vitest'
import { editNotes } from './editNotes'

describe('editNotes (D-12, D-147, D-148)', () => {
  it('has no notes for a division nobody is in and no scores are saved for', () => {
    expect(editNotes({ registrationCount: 0, hasScores: false })).toEqual({})
  })

  it('notes gender, ages, and averages when bowlers are registered, naming the count', () => {
    const notes = editNotes({ registrationCount: 12, hasScores: false })

    const registered =
      '12 bowlers are registered in this division. The change is not retroactive; review them by hand.'
    expect(notes.gender).toBe(registered)
    expect(notes.minimumAge).toBe(registered)
    expect(notes.maximumAge).toBe(registered)
    expect(notes.minimumAverage).toBe(registered)
    expect(notes.maximumAverage).toBe(registered)
    expect(notes.name).toBeUndefined()
    expect(notes.handicapBase).toBeUndefined()
    expect(notes.maximumHandicapPerGame).toBeUndefined()
  })

  it('says "1 bowler is registered" for one', () => {
    expect(editNotes({ registrationCount: 1, hasScores: false }).gender).toMatch(
      /^1 bowler is registered in this division\./,
    )
  })

  it('notes the three handicap boxes when scores are saved', () => {
    const notes = editNotes({ registrationCount: 0, hasScores: true })

    const results = 'Scores are saved for bowlers in this division. Posted results change at once.'
    expect(notes.handicapPercentage).toBe(results)
    expect(notes.handicapBase).toBe(results)
    expect(notes.maximumHandicapPerGame).toBe(results)
    expect(notes.gender).toBeUndefined()
    expect(notes.minimumAge).toBeUndefined()
  })

  it('adds the scratch-to-handicap note to the percent when bowlers are registered', () => {
    const only = editNotes({ registrationCount: 3, hasScores: false })
    expect(only.handicapPercentage).toBe(
      'Setting or clearing it while 3 bowlers are registered also asks you to confirm: handicap divisions need a USBC ID.',
    )
    expect(only.handicapBase).toBeUndefined()

    const both = editNotes({ registrationCount: 3, hasScores: true })
    expect(both.handicapPercentage).toBe(
      'Scores are saved for bowlers in this division. Posted results change at once. Setting or clearing it while 3 bowlers are registered also asks you to confirm: handicap divisions need a USBC ID.',
    )
    expect(both.handicapBase).toBe(
      'Scores are saved for bowlers in this division. Posted results change at once.',
    )
  })
})
