import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createDivision, createSquad, createSweeper } from '../../mocks/data'
import { emptyBowler, emptyRegistration, type RegistrationValues } from './deskForm'
import { ReviewStep } from './ReviewStep'
import type { BowlerRegistration, BowlerValues } from './types'

const scratch = createDivision({ name: 'Scratch' })
const handicap = createDivision({ name: 'Handicap' })
const morning = createSquad({ date: '2026-10-24T09:00:00', entryFee: 50 })
const afternoon = createSquad({ date: '2026-10-24T13:00:00', entryFee: 60.1 })
const sweeper = createSweeper({ date: '2026-10-24T12:00:00', entryFee: 25.2 })
const maria: BowlerValues = {
  ...emptyBowler,
  firstName: 'Maria',
  lastName: 'Gonzalez',
  usbcId: '1234-56789',
  street: '14 Elm Street',
}

function show(
  registration: Partial<RegistrationValues> = {},
  props: {
    bowler?: BowlerValues
    stored?: BowlerValues
    existing?: BowlerRegistration | null
  } = {},
) {
  render(
    <ReviewStep
      heading="Check and save"
      name="Maria Gonzalez"
      bowler={props.bowler ?? maria}
      stored={props.stored}
      registration={{
        ...emptyRegistration,
        divisionId: scratch.id,
        squadIds: [morning.id],
        ...registration,
      }}
      existing={props.existing ?? null}
      divisions={[handicap, scratch]}
      squads={[morning, afternoon]}
      sweepers={[sweeper]}
    />,
  )
}

const held: BowlerRegistration = {
  id: 'r1',
  divisionId: handicap.id,
  divisionName: 'Handicap',
  average: 182,
  superSweeper: false,
  squadIds: [morning.id],
  sweeperIds: [],
  hasScores: false,
}

describe('ReviewStep (D-158, D-160, D-165)', () => {
  it('names the bowler with the USBC ID, trimmed, and leaves it out when empty', () => {
    show({}, { bowler: { ...maria, usbcId: ' 1234-56789 ' } })
    expect(screen.getByText('Maria Gonzalez').parentElement).toHaveTextContent(
      /^Maria Gonzalez · 1234-56789$/,
    )
  })

  it('shows no USBC ID separator when the bowler has none', () => {
    show({}, { bowler: { ...maria, usbcId: '   ' } })

    expect(screen.getByText('Maria Gonzalez').parentElement).toHaveTextContent(/^Maria Gonzalez$/)
  })

  it('says a new registration, with the division and the average, trimmed', () => {
    show({ average: ' 190 ' })

    expect(screen.getByText('New registration in Scratch, average 190.')).toBeVisible()
  })

  it('leaves out the average when there is none', () => {
    show({ average: '  ' })

    expect(screen.getByText('New registration in Scratch.')).toBeVisible()
  })

  it('lists the new squads and sweepers, and the super sweeper', () => {
    show({ squadIds: [morning.id, afternoon.id], sweeperIds: [sweeper.id], superSweeper: true })

    expect(
      screen.getByText(
        'Squads: Sat 10/24/2026 9:00 AM, Sat 10/24/2026 1:00 PM. Sweepers: Sat 10/24/2026 12:00 PM. Super sweeper.',
      ),
    ).toBeVisible()
  })

  it('says no new sweepers, and no new squads', () => {
    show({ squadIds: [] })

    expect(screen.getByText('No new squads. No new sweepers.')).toBeVisible()
  })

  it('leaves out held squads and sweepers from the new ones (REG-11)', () => {
    show(
      { squadIds: [morning.id, afternoon.id], sweeperIds: [sweeper.id], divisionId: handicap.id },
      { existing: { ...held, sweeperIds: [sweeper.id] }, stored: maria },
    )

    expect(screen.getByText('Squads: Sat 10/24/2026 1:00 PM. No new sweepers.')).toBeVisible()
  })

  it('says it adds to the existing registration, and not that it moves when the division is the same', () => {
    show({ divisionId: handicap.id }, { existing: held, stored: maria })

    expect(screen.getByText(/Adds to the existing registration in Handicap/)).toBeVisible()
    expect(screen.queryByText(/Moves the registration/)).not.toBeInTheDocument()
  })

  it('says it moves the registration when the division differs', () => {
    show({ divisionId: scratch.id }, { existing: held, stored: maria })

    expect(screen.getByText('Moves the registration from Handicap to Scratch.')).toBeVisible()
  })

  it('does not say it moves a new registration', () => {
    show()

    expect(screen.queryByText(/Moves the registration/)).not.toBeInTheDocument()
  })

  it('lists each changed field old against new, and "not set" for an empty old one', () => {
    show(
      {},
      {
        stored: { ...maria, city: '' },
        bowler: { ...maria, street: '88 Pine Road', city: 'Auburn' },
      },
    )

    expect(screen.getByText('Street: 14 Elm Street → 88 Pine Road')).toBeVisible()
    expect(screen.getByText('City: not set → Auburn')).toBeVisible()
  })

  it('treats an old text of only spaces as not set', () => {
    show({}, { stored: { ...maria, city: '   ' }, bowler: { ...maria, city: 'Auburn' } })

    expect(screen.getByText('City: not set → Auburn')).toBeVisible()
  })

  it('lists no changes for a new bowler or an unchanged one', () => {
    show({}, { stored: maria })

    expect(screen.queryByText('Changes to the bowler:')).not.toBeInTheDocument()
  })

  it('says the app records a $0 desk entry and does not track payments (D-163)', () => {
    show()

    expect(
      screen.getByText(
        'Take the money at the desk. This app records a $0 desk entry and does not track payments.',
      ),
    ).toBeVisible()
  })

  it('labels the section with its heading', () => {
    show()

    expect(screen.getByRole('region', { name: 'Check and save' })).toBeVisible()
  })

  describe('what to collect (D-166)', () => {
    it('lists each squad and sweeper with its fee, and the total', () => {
      show({ squadIds: [morning.id, afternoon.id], sweeperIds: [sweeper.id] })

      const table = screen.getByRole('table', { name: 'What to collect' })
      expect(
        within(table).getByRole('row', { name: 'Squad Sat 10/24/2026 9:00 AM $50.00' }),
      ).toBeVisible()
      expect(
        within(table).getByRole('row', { name: 'Squad Sat 10/24/2026 1:00 PM $60.10' }),
      ).toBeVisible()
      expect(
        within(table).getByRole('row', { name: 'Sweeper Sat 10/24/2026 12:00 PM $25.20' }),
      ).toBeVisible()
      expect(within(table).getByRole('row', { name: 'Total to collect $135.30' })).toBeVisible()
    })

    it('adds in cents, so 60.10 and 25.20 do not drift', () => {
      show({ squadIds: [afternoon.id], sweeperIds: [sweeper.id] })

      expect(screen.getByRole('row', { name: 'Total to collect $85.30' })).toBeVisible()
    })

    it('collects nothing for a squad or sweeper the bowler already holds, and names the table for additions (D-165)', () => {
      show(
        { squadIds: [morning.id, afternoon.id], divisionId: handicap.id },
        { existing: held, stored: maria },
      )

      const table = screen.getByRole('table', { name: 'What to collect for these additions' })
      expect(within(table).queryByText(/9:00 AM/)).not.toBeInTheDocument()
      expect(within(table).getByRole('row', { name: 'Total to collect $60.10' })).toBeVisible()
    })

    it('says nothing is due when there is nothing new', () => {
      show({ squadIds: [morning.id] }, { existing: held, stored: maria })

      expect(screen.getByText('Nothing to collect.')).toBeVisible()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('has no table when nothing is picked', () => {
      show({ squadIds: [] })

      expect(screen.getByText('Nothing to collect.')).toBeVisible()
    })
  })
})
