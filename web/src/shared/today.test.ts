import { describe, expect, it } from 'vitest'
import { todayLocal } from './today'

describe('todayLocal', () => {
  it('pads the month and day', () => {
    expect(todayLocal(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05')
  })

  it('uses the local date, even late in the evening', () => {
    expect(todayLocal(new Date(2026, 9, 21, 23, 59, 59))).toBe('2026-10-21')
  })

  it('reads two-digit months and days as they are', () => {
    expect(todayLocal(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('defaults to now', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
