import { describe, expect, it } from 'vitest'
import { createEditInfo, createSquad, createSweeper } from '../../mocks/data'
import { emptyBowler } from './deskForm'
import {
  buildEditRequest,
  describeResult,
  editChangesOf,
  editedFields,
  hasChanges,
  moneyOf,
  removeLock,
  storedBowlerOf,
  toEditRegistrationValues,
} from './editForm'

const squadA = createSquad({ date: '2026-10-24T09:00:00', entryFee: 75 })
const squadB = createSquad({ date: '2026-10-24T13:00:00', entryFee: 80 })
const squadC = createSquad({ date: '2026-10-25T09:00:00', entryFee: 0.1 })
const sweeperA = createSweeper({ date: '2026-10-24T12:00:00', entryFee: 20 })
const sweeperB = createSweeper({ date: '2026-10-25T08:00:00', entryFee: 0.2 })

const info = createEditInfo({
  registration: {
    divisionId: 'd1',
    average: 182,
    squadIds: [squadA.id],
    sweeperIds: [sweeperA.id],
  },
})

const start = () => toEditRegistrationValues(info.registration)
const bowler = () => storedBowlerOf(info)

describe('toEditRegistrationValues (D-197)', () => {
  it('starts from what is stored, the average as text', () => {
    expect(start()).toEqual({
      divisionId: 'd1',
      average: '182',
      squadIds: [squadA.id],
      sweeperIds: [sweeperA.id],
      superSweeper: false,
    })
  })

  it('shows no average as a blank box', () => {
    const values = toEditRegistrationValues({ ...info.registration, average: null })

    expect(values.average).toBe('')
  })

  it('copies the lists, so a tick does not change the stored ones', () => {
    const values = start()

    expect(values.squadIds).not.toBe(info.registration.squadIds)
  })
})

describe('editedFields and editChangesOf (BWL-16, D-206)', () => {
  it('lists only the changed fields, trimmed', () => {
    const edited = { ...bowler(), email: ' new@example.com ', city: 'Boston' }

    expect(editedFields(bowler(), edited)).toEqual({ email: 'new@example.com', city: 'Boston' })
  })

  it('keeps an emptied box so it clears (D-206)', () => {
    const edited = { ...bowler(), phoneNumber: '' }

    expect(editedFields(bowler(), edited)).toEqual({ phoneNumber: '' })
    expect(editChangesOf(bowler(), edited)).toEqual([
      { key: 'phoneNumber', from: '5085550142', to: '' },
    ])
  })

  it('ignores a stored value with stray spaces that the desk did not touch', () => {
    const stored = { ...bowler(), city: 'Worcester ' }

    expect(editedFields(stored, { ...stored })).toEqual({})
  })

  it('orders the changes as the form lists the fields', () => {
    const edited = { ...bowler(), usbcId: '1111-2222', firstName: 'Mary' }

    expect(editChangesOf(bowler(), edited).map((change) => change.key)).toEqual([
      'firstName',
      'usbcId',
    ])
  })

  it('has no changes for the stored bowler', () => {
    expect(editChangesOf(bowler(), bowler())).toEqual([])
    expect(bowler()).not.toHaveProperty('id')
    expect(Object.keys(bowler()).sort()).toEqual(Object.keys(emptyBowler).sort())
  })
})

describe('buildEditRequest (D-199, D-201, D-206)', () => {
  it('sends nothing for an untouched form', () => {
    expect(buildEditRequest({ info, bowler: bowler(), registration: start() })).toEqual({})
  })

  it('sends additions and removals, never full lists (D-199, REG-21, REG-20)', () => {
    const registration = {
      ...start(),
      squadIds: [squadB.id],
      sweeperIds: [sweeperA.id, sweeperB.id],
    }

    expect(buildEditRequest({ info, bowler: bowler(), registration })).toEqual({
      addSquadIds: [squadB.id],
      removeSquadIds: [squadA.id],
      addSweeperIds: [sweeperB.id],
    })
  })

  it('sends a removed sweeper (REG-20)', () => {
    const registration = { ...start(), sweeperIds: [] }

    expect(buildEditRequest({ info, bowler: bowler(), registration })).toEqual({
      removeSweeperIds: [sweeperA.id],
    })
  })

  it('sends a new division, average, and super sweeper only when they changed (REG-15, REG-16, REG-17)', () => {
    const registration = { ...start(), divisionId: 'd2', average: '175', superSweeper: true }

    expect(buildEditRequest({ info, bowler: bowler(), registration })).toEqual({
      divisionId: 'd2',
      average: 175,
      superSweeper: true,
    })
  })

  it('sends a blank average as null, and not at all when none was stored (REG-16)', () => {
    expect(
      buildEditRequest({ info, bowler: bowler(), registration: { ...start(), average: '  ' } }),
    ).toEqual({ average: null })

    const without = createEditInfo({ registration: { average: null } })
    expect(
      buildEditRequest({
        info: without,
        bowler: storedBowlerOf(without),
        registration: { ...toEditRegistrationValues(without.registration), average: '' },
      }),
    ).toEqual({})
  })

  it('sends the changed bowler fields, an emptied one as an empty string (D-206)', () => {
    const edited = { ...bowler(), phoneNumber: '', email: 'x@example.com' }

    expect(buildEditRequest({ info, bowler: edited, registration: start() })).toEqual({
      bowler: { phoneNumber: '', email: 'x@example.com' },
    })
  })

  it('adds the confirmation flag when asked (D-201)', () => {
    const request = buildEditRequest({
      info,
      bowler: bowler(),
      registration: { ...start(), average: '175' },
      confirmWarnings: true,
    })

    expect(request).toEqual({ average: 175, confirmWarnings: true })
  })
})

describe('hasChanges', () => {
  it('is false for an empty request and for the confirmation alone', () => {
    expect(hasChanges({})).toBe(false)
    expect(hasChanges({ confirmWarnings: true })).toBe(false)
  })

  it('is true for any change', () => {
    expect(hasChanges({ superSweeper: false })).toBe(true)
    expect(hasChanges({ bowler: { city: 'x' } })).toBe(true)
  })
})

describe('moneyOf (EDR-03, D-207)', () => {
  const lists = { squads: [squadA, squadB, squadC], sweepers: [sweeperA, sweeperB] }

  it('has nothing to collect or refund when nothing changed', () => {
    expect(moneyOf({ info, registration: start(), ...lists })).toEqual({
      collect: [],
      refund: [],
      net: 0,
    })
  })

  it('collects an added squad and sweeper', () => {
    const registration = {
      ...start(),
      squadIds: [squadA.id, squadB.id],
      sweeperIds: [sweeperA.id, sweeperB.id],
    }

    const money = moneyOf({ info, registration, ...lists })

    expect(money.collect).toEqual([
      { kind: 'squad', id: squadB.id, date: squadB.date, amount: 80 },
      { kind: 'sweeper', id: sweeperB.id, date: sweeperB.date, amount: 0.2 },
    ])
    expect(money.refund).toEqual([])
    expect(money.net).toBe(80.2)
  })

  it('refunds a removed squad and sweeper, with a negative net', () => {
    const registration = { ...start(), squadIds: [squadB.id], sweeperIds: [] }

    const money = moneyOf({ info, registration, ...lists })

    expect(money.refund.map((line) => line.id)).toEqual([squadA.id, sweeperA.id])
    expect(money.collect.map((line) => line.id)).toEqual([squadB.id])
    expect(money.net).toBe(80 - 75 - 20)
  })

  it('nets a squad switch at the two fees', () => {
    const switched = moneyOf({
      info,
      registration: { ...start(), squadIds: [squadB.id] },
      ...lists,
    })

    expect(switched.net).toBe(5)
  })

  it('is even when the two fees match', () => {
    const same = createSquad({ entryFee: 75 })

    const money = moneyOf({
      info,
      registration: { ...start(), squadIds: [same.id] },
      squads: [squadA, same],
      sweepers: [sweeperA],
    })

    expect(money.net).toBe(0)
    expect(money.collect).toHaveLength(1)
    expect(money.refund).toHaveLength(1)
  })

  it('adds in whole cents (0.1 and 0.2 make 0.3)', () => {
    const lean = createEditInfo({ registration: { squadIds: [squadA.id], sweeperIds: [] } })

    const money = moneyOf({
      info: lean,
      registration: {
        ...toEditRegistrationValues(lean.registration),
        squadIds: [squadA.id, squadC.id],
        sweeperIds: [sweeperB.id],
      },
      ...lists,
    })

    expect(money.net).toBe(0.3)
  })

  it('has no fee for a session it cannot find', () => {
    const money = moneyOf({
      info,
      registration: { ...start(), squadIds: [squadA.id, 'unknown'] },
      ...lists,
    })

    expect(money.collect).toEqual([])
  })
})

describe('describeResult', () => {
  it.each([
    [{ added: 2, removed: 1 }, 'Registration updated. Added 2, removed 1.'],
    [{ added: 1, removed: 0 }, 'Registration updated. Added 1.'],
    [{ added: 0, removed: 3 }, 'Registration updated. Removed 3.'],
    [{ added: 0, removed: 0 }, 'Registration updated.'],
  ])('says %j as %s', (result, text) => {
    expect(describeResult(result)).toBe(text)
  })
})

describe('removeLock (REG-34, D-10)', () => {
  const locked = createEditInfo({ locks: { scoredSessionIds: [squadB.id] } })

  it('refuses a complete session first', () => {
    expect(removeLock({ id: squadB.id, complete: true }, locked)).toBe(
      'Cannot remove: this one is complete.',
    )
  })

  it('refuses a session with scores', () => {
    expect(removeLock({ id: squadB.id, complete: false }, locked)).toBe(
      'Cannot remove: this bowler has scores here.',
    )
  })

  it('allows an open session with no scores', () => {
    expect(removeLock({ id: squadA.id, complete: false }, locked)).toBeUndefined()
  })
})
