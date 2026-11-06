import { describe, expect, it } from 'vitest'
import { completeMessage } from './createPlan.ts'
import { planDelete, registeredMessage } from './deletePlan.ts'

describe('planDelete (DIV-12, D-151)', () => {
  it('deletes a division nobody is registered in', () => {
    expect(planDelete({ completed: false, registrationCount: 0 })).toEqual({ kind: 'delete' })
  })

  it('refuses a complete tournament under the tournament key (DIV-03, D-143)', () => {
    expect(planDelete({ completed: true, registrationCount: 0 })).toEqual({
      kind: 'refused',
      errors: { tournament: 'This tournament is complete and cannot be changed' },
    })
    expect(completeMessage).toBe('This tournament is complete and cannot be changed')
  })

  it('refuses a division with bowlers under the division key', () => {
    expect(planDelete({ completed: false, registrationCount: 12 })).toEqual({
      kind: 'refused',
      errors: {
        division:
          '12 bowlers are registered in this division. Move them to another division first.',
      },
    })
  })

  it('lists both reasons, the tournament first', () => {
    const plan = planDelete({ completed: true, registrationCount: 1 })

    expect(plan).toEqual({
      kind: 'refused',
      errors: {
        tournament: completeMessage,
        division: '1 bowler is registered in this division. Move them to another division first.',
      },
    })
    expect(plan.kind === 'refused' && Object.keys(plan.errors)).toEqual(['tournament', 'division'])
  })

  it('counts one bowler in the singular and two in the plural', () => {
    expect(registeredMessage(1)).toBe(
      '1 bowler is registered in this division. Move them to another division first.',
    )
    expect(registeredMessage(2)).toBe(
      '2 bowlers are registered in this division. Move them to another division first.',
    )
  })
})
