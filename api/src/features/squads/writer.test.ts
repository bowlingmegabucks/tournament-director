import { describe, expect, it, vi } from 'vitest'
import { noSessionEditFacts } from '../../shared/sessionEdit.ts'
import type { NewSquad } from './createRequest.ts'
import { applyUpdate, toCreatedSquad } from './writer.ts'
import type { SquadEditContext } from './updatePlan.ts'

const defaults = { entryFee: 50, finalsRatio: 6, cashRatio: 4, games: 5 }

const input = (overrides: Partial<NewSquad> = {}): NewSquad => ({
  date: '2026-10-24T09:00:00',
  startingLane: 1,
  numberOfLanes: 24,
  maxPerPair: 4,
  entryFee: null,
  finalsRatio: null,
  cashRatio: null,
  ...overrides,
})

describe('toCreatedSquad', () => {
  it('shows the tournament values with the override flags false when the input leaves them blank (TRN-12, D-43)', () => {
    expect(toCreatedSquad('id-1', input(), defaults)).toEqual({
      id: 'id-1',
      date: '2026-10-24T09:00:00',
      complete: false,
      startingLane: 1,
      numberOfLanes: 24,
      maxPerPair: 4,
      entryFee: 50,
      entryFeeOverridden: false,
      finalsRatio: 6,
      finalsRatioOverridden: false,
      cashRatio: 4,
      cashRatioOverridden: false,
      games: 5,
    })
  })

  it('keeps each value the input sets and flags only that one (SQD-07)', () => {
    const squad = toCreatedSquad('id-2', input({ entryFee: 75, cashRatio: 0 }), defaults)

    expect(squad).toMatchObject({
      entryFee: 75,
      entryFeeOverridden: true,
      finalsRatio: 6,
      finalsRatioOverridden: false,
      cashRatio: 0,
      cashRatioOverridden: true,
      complete: false,
    })
  })
})

describe('applyUpdate (SQD-23)', () => {
  const context: SquadEditContext = {
    tournament: { completed: false, startDate: '2026-10-23', endDate: '2026-10-25' },
    complete: false,
    stored: input({ entryFee: 60 }),
    facts: noSessionEditFacts,
  }

  it('does not store anything when nothing changes, and answers the squad as it is', async () => {
    const persist = vi.fn(() => Promise.resolve())

    const outcome = await applyUpdate('id-1', context, defaults, { maxPerPair: 4 }, false, persist)

    expect(persist).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ changed: [], updated: { id: 'id-1', maxPerPair: 4 } })
  })

  it('stores the changes once and answers the squad with them', async () => {
    const persist = vi.fn(() => Promise.resolve())

    const outcome = await applyUpdate('id-1', context, defaults, { maxPerPair: 3 }, false, persist)

    expect(persist).toHaveBeenCalledExactlyOnceWith({ maxPerPair: 3 })
    expect(outcome).toMatchObject({ changed: ['maxPerPair'], updated: { maxPerPair: 3 } })
  })

  it('keeps the complete flag of the squad it answers', async () => {
    const outcome = await applyUpdate(
      'id-1',
      { ...context, complete: true },
      defaults,
      {},
      false,
      () => Promise.resolve(),
    )

    expect(outcome).toMatchObject({ updated: { complete: true } })
  })
})
