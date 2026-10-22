import { describe, expect, it } from 'vitest'
import { describeIssue } from './prismaRepository.ts'

describe('describeIssue', () => {
  it('shows the field and the message', () => {
    expect(describeIssue({ path: ['entryFee'], message: 'Too small' })).toBe('entryFee: Too small')
  })

  it('joins a nested path with dots', () => {
    expect(describeIssue({ path: ['address', 0, 'city'], message: 'Required' })).toBe(
      'address.0.city: Required',
    )
  })
})
