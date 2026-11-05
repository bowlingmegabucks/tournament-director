import { describe, expect, it } from 'vitest'
import { nameMatches } from './nameMatches'

describe('nameMatches (TRN-36, D-136)', () => {
  it('matches the same name', () => {
    expect(nameMatches('Spring Classic', 'Spring Classic')).toBe(true)
  })

  it('ignores case', () => {
    expect(nameMatches('spring CLASSIC', 'Spring Classic')).toBe(true)
  })

  it('ignores spaces around either side', () => {
    expect(nameMatches('  Spring Classic ', ' Spring Classic  ')).toBe(true)
  })

  it('does not match a different name', () => {
    expect(nameMatches('Spring Classi', 'Spring Classic')).toBe(false)
    expect(nameMatches('Spring Classic 2', 'Spring Classic')).toBe(false)
  })

  it('does not match an empty box', () => {
    expect(nameMatches('', 'Spring Classic')).toBe(false)
    expect(nameMatches('   ', 'Spring Classic')).toBe(false)
  })

  it('keeps spaces inside the name', () => {
    expect(nameMatches('SpringClassic', 'Spring Classic')).toBe(false)
  })
})
