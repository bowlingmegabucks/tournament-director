import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createDivision, createSquad, createSweeper } from '../../mocks/data'
import { emptyBowler, emptyRegistration, type RegistrationValues } from './deskForm'
import { ReviewStep } from './ReviewStep'
import type { BowlerRegistration, BowlerValues } from './types'

const scratch = createDivision({ name: 'Scratch' })
const handicap = createDivision({ name: 'Handicap' })
const morning = createSquad({ date: '2026-10-24T09:00:00' })
const afternoon = createSquad({ date: '2026-10-24T13:00:00' })
const sweeper = createSweeper({ date: '2026-10-24T12:00:00' })
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

  it('says a $0 desk entry is recorded', () => {
    show()

    expect(
      screen.getByText('A $0 desk entry is recorded. No money is taken in this app.'),
    ).toBeVisible()
  })

  it('labels the section with its heading', () => {
    show()

    expect(screen.getByRole('region', { name: 'Check and save' })).toBeVisible()
  })
})
