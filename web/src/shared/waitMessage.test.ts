import { describe, expect, it } from 'vitest'
import { waitMessage } from './waitMessage'

describe('waitMessage', () => {
  it.each([
    ['60', 'Too many attempts. Wait 1 minute and try again.'],
    ['61', 'Too many attempts. Wait 2 minutes and try again.'],
    ['600', 'Too many attempts. Wait 10 minutes and try again.'],
  ])('turns %s seconds into minutes, rounded up', (seconds, message) => {
    expect(waitMessage(seconds)).toBe(message)
  })

  it.each([null, '', '0', '-5', 'soon'])('falls back for %j', (value) => {
    expect(waitMessage(value)).toBe('Too many attempts. Try again later.')
  })
})
