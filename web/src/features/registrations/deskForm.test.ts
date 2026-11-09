import { describe, expect, it } from 'vitest'
import {
  bowlerLabels,
  buildRequest,
  changesOf,
  dueLines,
  changedFields,
  checkBowlerStep,
  checkRegistrationStep,
  emptyBowler,
  emptyRegistration,
  filledFields,
  overlayBowler,
  stepOfError,
  toBowlerValues,
  totalDue,
  toRegistrationValues,
} from './deskForm'
import { createSquad, createSweeper } from '../../mocks/data'
import type { BowlerRegistration, BowlerValues } from './types'

const maria: BowlerValues = {
  ...emptyBowler,
  firstName: 'Maria',
  lastName: 'Gonzalez',
  street: '14 Elm Street',
  city: 'Worcester',
  usbcId: '1234-56789',
  gender: 'Female',
}

const held: BowlerRegistration = {
  id: 'r1',
  divisionId: 'd1',
  divisionName: 'Handicap',
  average: 182,
  superSweeper: false,
  squadIds: ['s1'],
  sweeperIds: ['w1'],
  hasScores: false,
}

describe('what the desk changed (D-05, D-158)', () => {
  it('lists only the fields that differ, trimmed', () => {
    expect(changedFields(maria, { ...maria, street: ' 88 Pine Road ', city: 'Worcester' })).toEqual(
      {
        street: '88 Pine Road',
      },
    )
  })

  it('treats a blank box as no change, never a clear (D-05)', () => {
    expect(changedFields(maria, { ...maria, street: '  ', email: '' })).toEqual({})
  })

  it('lists every filled box of a new bowler', () => {
    expect(filledFields({ ...emptyBowler, firstName: 'Ann', lastName: ' Lee ' })).toEqual({
      firstName: 'Ann',
      lastName: 'Lee',
    })
  })

  it('overlays only the typed boxes on the stored bowler', () => {
    expect(overlayBowler(maria, { ...emptyBowler, street: '88 Pine Road', city: ' ' })).toEqual({
      ...maria,
      street: '88 Pine Road',
    })
  })

  it('copies a stored bowler into the form values, without the id', () => {
    const values = toBowlerValues({ ...maria, id: 'b1' })

    expect(values).toEqual(maria)
    expect(values).not.toHaveProperty('id')
  })
})

describe('step checks (D-162, REG-03, REG-16)', () => {
  it('asks for both names, with the legacy words', () => {
    expect(checkBowlerStep({ ...emptyBowler, firstName: '  ' })).toEqual({
      'bowler.firstName': 'First Name is Required',
      'bowler.lastName': 'Last Name is Required',
    })
    expect(checkBowlerStep(maria)).toEqual({})
  })

  it('asks for a division and a squad', () => {
    expect(checkRegistrationStep(emptyRegistration)).toEqual({
      divisionId: 'Pick a division',
      squadIds: 'Bowler must enter at least one squad',
    })
    expect(
      checkRegistrationStep({ ...emptyRegistration, divisionId: 'd', squadIds: ['s'] }),
    ).toEqual({})
  })

  it('on an edit, points the last-squad refusal at delete (D-203, D-214)', () => {
    expect(checkRegistrationStep(emptyRegistration, { editing: true })).toEqual({
      divisionId: 'Pick a division',
      squadIds:
        'Bowler must enter at least one squad. To remove the last one, delete the registration.',
    })
    expect(checkRegistrationStep(emptyRegistration, { editing: false })).toMatchObject({
      squadIds: 'Bowler must enter at least one squad',
    })
  })

  it.each([
    ['0', 'Average must be greater than 0.'],
    ['-5', 'Average must be greater than 0.'],
    ['301', 'Average must be less than or equal to 300.'],
    ['1.5', 'Enter a whole number'],
    ['abc', 'Enter a whole number'],
  ])('refuses the average %s', (average, message) => {
    const errors = checkRegistrationStep({
      ...emptyRegistration,
      divisionId: 'd',
      squadIds: ['s'],
      average,
    })

    expect(errors).toEqual({ average: message })
  })

  it.each(['', ' ', '1', '300'])('accepts the average "%s"', (average) => {
    expect(
      checkRegistrationStep({ ...emptyRegistration, divisionId: 'd', squadIds: ['s'], average }),
    ).toEqual({})
  })
})

describe('the request (D-157, D-165)', () => {
  const registration = { ...emptyRegistration, divisionId: 'd1', squadIds: ['s2'], average: '190' }

  it('sends a new bowler as its filled boxes, with no id and no append flag', () => {
    const request = buildRequest({
      stored: undefined,
      bowler: { ...emptyBowler, firstName: 'Ann', lastName: 'Lee' },
      registration,
      existing: null,
      confirmAppend: false,
    })

    expect(request).toEqual({
      divisionId: 'd1',
      average: 190,
      squadIds: ['s2'],
      sweeperIds: [],
      superSweeper: false,
      bowler: { firstName: 'Ann', lastName: 'Lee' },
    })
  })

  it('sends a stored bowler by id with only the changes', () => {
    const request = buildRequest({
      stored: { id: 'b1', values: maria },
      bowler: { ...maria, street: '88 Pine Road' },
      registration,
      existing: null,
      confirmAppend: false,
    })

    expect(request.bowlerId).toBe('b1')
    expect(request.bowler).toEqual({ street: '88 Pine Road' })
    expect(request).not.toHaveProperty('appendToExisting')
  })

  it('leaves out the squads and sweepers already held, and flags the append', () => {
    const request = buildRequest({
      stored: { id: 'b1', values: maria },
      bowler: maria,
      registration: { ...registration, squadIds: ['s1', 's2'], sweeperIds: ['w1', 'w2'] },
      existing: held,
      confirmAppend: false,
    })

    expect(request.squadIds).toEqual(['s2'])
    expect(request.sweeperIds).toEqual(['w2'])
    expect(request.appendToExisting).toBe(true)
    expect(request.bowler).toEqual({})
  })

  it('flags the append after the desk confirmed it at the fallback dialog (D-159)', () => {
    const request = buildRequest({
      stored: { id: 'b1', values: maria },
      bowler: maria,
      registration,
      existing: null,
      confirmAppend: true,
    })

    expect(request.appendToExisting).toBe(true)
  })

  it('sends a blank average as null', () => {
    expect(
      buildRequest({
        stored: undefined,
        bowler: emptyBowler,
        registration: { ...registration, average: ' ' },
        existing: null,
        confirmAppend: false,
      }).average,
    ).toBeNull()
  })

  it('starts the form from the stored registration', () => {
    expect(toRegistrationValues(held)).toEqual({
      divisionId: 'd1',
      average: '182',
      squadIds: ['s1'],
      sweeperIds: ['w1'],
      superSweeper: false,
    })
    expect(toRegistrationValues({ ...held, average: null }).average).toBe('')
  })
})

describe('where an error belongs', () => {
  it('puts the bowler fields on step 1 and the rest on step 2', () => {
    expect(stepOfError('bowler.email')).toBe(1)
    expect(stepOfError('squadIds')).toBe(2)
    expect(stepOfError('average')).toBe(2)
    expect(stepOfError('form')).toBe(2)
  })
})

describe('the fixed lists', () => {
  it('starts every bowler box empty', () => {
    expect(emptyBowler).toEqual({
      firstName: '',
      middleInitial: '',
      lastName: '',
      suffix: '',
      street: '',
      city: '',
      state: '',
      zipCode: '',
      email: '',
      phoneNumber: '',
      usbcId: '',
      dateOfBirth: '',
      gender: '',
    })
    expect(emptyRegistration).toEqual({
      divisionId: '',
      average: '',
      squadIds: [],
      sweeperIds: [],
      superSweeper: false,
    })
  })

  it('names each box as the form and Review do', () => {
    expect(bowlerLabels).toEqual({
      firstName: 'First name',
      middleInitial: 'Middle initial',
      lastName: 'Last name',
      suffix: 'Suffix',
      street: 'Street',
      city: 'City',
      state: 'State',
      zipCode: 'Zip',
      email: 'Email',
      phoneNumber: 'Phone',
      usbcId: 'USBC ID',
      dateOfBirth: 'Date of birth',
      gender: 'Gender',
    })
  })
})

describe('spaces around what was typed or stored', () => {
  it('sees no change when only the spaces differ, in the change list and on Review', () => {
    const stored = { ...maria, street: '14 Elm Street ' }
    const edited = { ...maria, street: ' 14 Elm Street' }

    expect(changedFields(stored, edited)).toEqual({})
    expect(changesOf(stored, edited)).toEqual([])
  })

  it('lists a change with the new text trimmed and the stored text as it is', () => {
    expect(changesOf(maria, { ...maria, city: ' Auburn ' })).toEqual([
      { key: 'city', from: 'Worcester', to: 'Auburn' },
    ])
  })

  it('treats a last name of only spaces as missing', () => {
    expect(checkBowlerStep({ ...emptyBowler, firstName: 'Ann', lastName: '   ' })).toEqual({
      'bowler.lastName': 'Last Name is Required',
    })
  })
})

describe('what the desk collects (D-166, TRN-12)', () => {
  const s1 = createSquad({ date: '2026-10-24T09:00:00', entryFee: 50 })
  const s2 = createSquad({ date: '2026-10-24T13:00:00', entryFee: 60 })
  const w1 = createSweeper({ date: '2026-10-24T12:00:00', entryFee: 25 })
  const base = { ...emptyRegistration, squadIds: [s2.id, s1.id], sweeperIds: [w1.id] }

  it('lists the squads then the sweepers, each in the order the lists come, with its own fee', () => {
    expect(
      dueLines({ registration: base, existing: null, squads: [s1, s2], sweepers: [w1] }),
    ).toEqual([
      { kind: 'squad', id: s1.id, date: s1.date, amount: 50 },
      { kind: 'squad', id: s2.id, date: s2.date, amount: 60 },
      { kind: 'sweeper', id: w1.id, date: w1.date, amount: 25 },
    ])
  })

  it('leaves out what is not picked', () => {
    const lines = dueLines({
      registration: { ...emptyRegistration, squadIds: [s1.id] },
      existing: null,
      squads: [s1, s2],
      sweepers: [w1],
    })

    expect(lines.map((line) => line.id)).toEqual([s1.id])
  })

  it('leaves out a squad and a sweeper the bowler already holds', () => {
    const lines = dueLines({
      registration: base,
      existing: { ...held, squadIds: [s1.id], sweeperIds: [w1.id] },
      squads: [s1, s2],
      sweepers: [w1],
    })

    expect(lines.map((line) => line.id)).toEqual([s2.id])
  })

  it('adds whole cents', () => {
    const lines = [0.1, 0.2, 60.1].map((amount, index) => ({
      kind: 'squad' as const,
      id: String(index),
      date: '',
      amount,
    }))

    expect(totalDue(lines)).toBe(60.4)
    expect(totalDue([])).toBe(0)
  })
})
