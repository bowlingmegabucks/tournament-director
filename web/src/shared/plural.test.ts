import { describe, expect, it } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('uses the singular word for one', () => {
    expect(plural(1, 'entry', 'entries')).toBe('1 entry')
  })

  it('uses the plural word for zero and for more than one', () => {
    expect(plural(0, 'entry', 'entries')).toBe('0 entries')
    expect(plural(2, 'entry', 'entries')).toBe('2 entries')
  })
})
