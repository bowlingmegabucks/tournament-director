import { describe, expect, it } from 'vitest'
import { sameValues } from './sameValues'

describe('sameValues', () => {
  it('matches equal text, numbers, and empty values', () => {
    expect(sameValues('a', 'a')).toBe(true)
    expect(sameValues(3, 3)).toBe(true)
    expect(sameValues('', '')).toBe(true)
    expect(sameValues(undefined, undefined)).toBe(true)
  })

  it('tells different primitives apart, and null from an empty record', () => {
    expect(sameValues('a', 'b')).toBe(false)
    expect(sameValues('1', 1)).toBe(false)
    expect(sameValues('', undefined)).toBe(false)
    expect(sameValues(null, {})).toBe(false)
    expect(sameValues({}, null)).toBe(false)
  })

  it('compares records by content, whatever the key order', () => {
    expect(sameValues({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
    expect(sameValues({ a: '1' }, { a: '2' })).toBe(false)
    expect(sameValues({ a: '1' }, { a: '1', b: '' })).toBe(false)
    expect(sameValues({ a: '1', b: '' }, { a: '1' })).toBe(false)
    expect(sameValues({ a: undefined }, { b: undefined })).toBe(false)
  })

  it('compares nested records and lists', () => {
    expect(sameValues({ pins: { o: '10' } }, { pins: { o: '10' } })).toBe(true)
    expect(sameValues({ pins: { o: '10' } }, { pins: { o: '11' } })).toBe(false)
    expect(sameValues(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameValues(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameValues(['a', 'b'], ['a', 'c'])).toBe(false)
    expect(sameValues(['a'], ['a', 'b'])).toBe(false)
  })

  it('does not match a list with a record or a primitive', () => {
    expect(sameValues([], {})).toBe(false)
    expect(sameValues({}, [])).toBe(false)
    expect(sameValues(['a'], 'a')).toBe(false)
    expect(sameValues('a', ['a'])).toBe(false)
  })
})
