import { describe, expect, it } from 'vitest'
import { describeAtLarge, describeChange, describePayout } from './describe'
import type { SquadChange } from './types'

const change: SquadChange = {
  squadId: 's',
  registrationId: 'r',
  squadDate: '2026-11-26T08:00:00',
  divisionName: 'Open',
  name: 'Cal Lane',
  change: 'losesAdvance',
}

describe('describeChange', () => {
  it.each([
    ['losesAdvance', 'no longer advances'],
    ['gainsAdvance', 'now advances'],
    ['losesCash', 'no longer cashes'],
    ['gainsCash', 'now cashes'],
  ] as const)('words %s', (kind, words) => {
    const line = describeChange({ ...change, change: kind })

    expect(line).toContain(`Cal Lane ${words} (Open, `)
    expect(line).toContain('11/26/2026')
  })
})

describe('describeAtLarge', () => {
  const spots = { divisionId: 'd', divisionName: 'Open', spotsBefore: 1, spotsAfter: 2 }

  it('gives the spots, and who is in and out', () => {
    expect(describeAtLarge({ ...spots, joins: ['A', 'B'], leaves: ['C'] })).toBe(
      'Open at-large spots: 1 now, 2 after. In: A, B. Out: C.',
    )
  })

  it('leaves out an empty list', () => {
    expect(describeAtLarge({ ...spots, joins: [], leaves: [] })).toBe(
      'Open at-large spots: 1 now, 2 after.',
    )
  })
})

describe('describePayout', () => {
  const payout = { payoutId: 'p', label: 'Finals: Open', name: 'Cal Lane', amount: '50.00' }

  it('shows the note the system writes', () => {
    expect(describePayout({ ...payout, note: 'Moved.' })).toBe(
      'Cal Lane, Finals: Open, $50.00: the payout stays and gets the note “Moved.”',
    )
  })

  it('says an existing note is kept', () => {
    expect(describePayout({ ...payout, note: null })).toBe(
      'Cal Lane, Finals: Open, $50.00: the payout stays and keeps the note it has.',
    )
  })
})
