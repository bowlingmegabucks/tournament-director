import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SmartScholarshipField } from './SmartScholarshipField'

const label = 'Youth bowler: winnings go to their SMART account'

function show(props: Partial<Parameters<typeof SmartScholarshipField>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <SmartScholarshipField
      checked={false}
      dateOfBirth=""
      error={undefined}
      onChange={onChange}
      {...props}
    />,
  )
  return onChange
}

describe('SmartScholarshipField (SMT-01, SMT-07)', () => {
  it('reports a tick', async () => {
    const onChange = show()

    await userEvent.click(screen.getByRole('checkbox', { name: label }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('says nothing about age until it is ticked', () => {
    show({ dateOfBirth: '1980-01-01' })

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('warns, and describes the box with the warning, for an adult', () => {
    show({ checked: true, dateOfBirth: '1980-01-01' })

    expect(screen.getByRole('status')).toHaveTextContent('This bowler is 18 or older.')
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(/18 or older/)
  })

  it('does not warn for a youth', () => {
    show({ checked: true, dateOfBirth: `${new Date().getFullYear() - 10}-01-01` })

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a refusal under the box', () => {
    show({ checked: true, error: 'A payout is already marked paid.' })

    expect(screen.getByRole('checkbox')).toBeInvalid()
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(/already marked paid/)
  })
})
