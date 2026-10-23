import { describe, expect, it } from 'vitest'
import { field } from './field'

describe('field', () => {
  it('reads a key of an object', () => {
    expect(field({ id: 'a', count: 0 }, 'id')).toBe('a')
    expect(field({ id: 'a', count: 0 }, 'count')).toBe(0)
  })

  it('gives undefined for a missing key', () => {
    expect(field({ id: 'a' }, 'name')).toBeUndefined()
  })

  it.each([null, undefined, 'text', 42, true])('gives undefined for %s', (value) => {
    expect(field(value, 'id')).toBeUndefined()
  })

  it('reads a key of an array', () => {
    expect(field(['x'], 'length')).toBe(1)
  })
})
