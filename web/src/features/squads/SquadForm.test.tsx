import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SquadForm } from './SquadForm'
import { emptySquadForm } from './validateSquad'

function renderForm(notes: Parameters<typeof SquadForm>[0]['notes']) {
  render(
    <MemoryRouter>
      <SquadForm
        initialValues={{ ...emptySquadForm, date: '2026-10-24T09:00', entryFee: '60' }}
        dates={{ startDate: '2026-10-23', endDate: '2026-10-25' }}
        tournamentValues={{ entryFee: '$50.00', finalsRatio: '1 in 6.0', cashRatio: '1 in 4.0' }}
        pending={false}
        notes={notes}
        onSubmit={() => Promise.resolve(undefined)}
        onFailure={() => undefined}
        onAttempt={() => undefined}
        cancelTo="/x"
      />
    </MemoryRouter>,
  )
}

describe('SquadForm notes (SQD-27, D-185)', () => {
  it('locks only the boxes whose note holds a lock, and says why', () => {
    renderForm({ entryFee: { lock: 'Fixed for now.' }, date: { lock: 'No moves.' } })

    expect(screen.getByLabelText('Entry fee')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Date and time (required)')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Entry fee')).toHaveAccessibleDescription(
      expect.stringContaining('Locked: Fixed for now.'),
    )
    expect(screen.getByLabelText('Cash ratio')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Starting lane (required)')).not.toHaveAttribute('readonly')
  })

  it('leaves every box open with no notes', () => {
    renderForm(undefined)

    for (const label of ['Entry fee', 'Date and time (required)', 'Cash ratio']) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('readonly')
    }
  })
})
