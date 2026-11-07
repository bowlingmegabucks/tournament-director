import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SweeperForm } from './SweeperForm'
import { emptySweeperForm } from './validateSweeper'

function renderForm(notes: Parameters<typeof SweeperForm>[0]['notes']) {
  render(
    <MemoryRouter>
      <SweeperForm
        initialValues={{ ...emptySweeperForm, date: '2026-10-24T18:00', bonusPins: { o: '10' } }}
        dates={{ startDate: '2026-10-23', endDate: '2026-10-25' }}
        divisions={[
          { id: 'o', name: 'Open' },
          { id: 'w', name: 'Women' },
        ]}
        pending={false}
        notes={notes}
        onSubmit={() => Promise.resolve(undefined)}
        onFailure={() => undefined}
        onAttempt={() => undefined}
        cancelTo="/x"
        addDivisionTo="/d"
      />
    </MemoryRouter>,
  )
}

describe('SweeperForm notes (SQD-27, D-185)', () => {
  it('locks only the boxes whose note holds a lock, a pin box and the date included', () => {
    renderForm({
      games: { lock: 'Scores are saved.' },
      date: { lock: 'No moves.' },
      'bonusPins.o': { lock: 'Pins fixed.' },
    })

    expect(screen.getByLabelText('Games (required)')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Date and time (required)')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Open')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Women')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Cash ratio (required)')).not.toHaveAttribute('readonly')
  })

  it('leaves every box open with no notes', () => {
    renderForm(undefined)

    for (const label of ['Games (required)', 'Date and time (required)', 'Open', 'Women']) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('readonly')
    }
  })
})
