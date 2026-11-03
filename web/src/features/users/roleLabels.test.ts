import { describe, expect, it } from 'vitest'
import { roleLabel } from './roleLabels'

describe('roleLabel', () => {
  it.each([
    ['scoreKeeper', 'Score keeper'],
    ['director', 'Tournament director'],
    ['admin', 'Admin'],
  ])('names %s as %s, with a hint', (role, label) => {
    const result = roleLabel(role)

    expect(result.label).toBe(label)
    expect(result.hint).toBeTruthy()
  })

  it('shows a role it does not know under its own name, with no hint', () => {
    expect(roleLabel('referee')).toEqual({ label: 'referee', hint: undefined })
  })
})
