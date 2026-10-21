import { describe, expect, it } from 'vitest'
import { createDemoTournamentRepository } from './demoRepository.ts'
import { tournamentSchema } from './types.ts'

const at = (iso: string) => () => new Date(`${iso}T15:30:00Z`)

describe('demo tournament repository', () => {
  it('returns valid tournaments in the vendor shape', async () => {
    const list = await createDemoTournamentRepository().list()

    expect(list).toHaveLength(4)
    for (const tournament of list) {
      expect(tournamentSchema.safeParse(tournament).success).toBe(true)
    }
  })

  it('starts the newest tournament two days from today and ends it two days later (TRN-13)', async () => {
    const [newest] = await createDemoTournamentRepository({ now: at('2026-10-21') }).list()

    expect(newest).toMatchObject({
      name: '2026 Northeast MegaBuck$ Tournament',
      startDate: '2026-10-23',
      endDate: '2026-10-25',
    })
  })

  it('puts the other three a year apart before it', async () => {
    const list = await createDemoTournamentRepository({ now: at('2026-10-21') }).list()

    expect(list.map((tournament) => tournament.startDate)).toEqual([
      '2026-10-23',
      '2025-10-23',
      '2024-10-23',
      '2023-10-24',
    ])
  })

  it('names each tournament for its start year', async () => {
    const list = await createDemoTournamentRepository({ now: at('2026-10-21') }).list()

    expect(list.map((tournament) => tournament.name.slice(0, 4))).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
    ])
  })

  it('finds a tournament by id', async () => {
    const repository = createDemoTournamentRepository()
    const [first] = await repository.list()

    expect(await repository.get(first?.id ?? '')).toEqual(first)
  })

  it('uses the same ids on every start, so a bookmark keeps working', async () => {
    const a = await createDemoTournamentRepository({ now: at('2026-10-21') }).list()
    const b = await createDemoTournamentRepository({ now: at('2027-03-01') }).list()

    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id))
  })

  it('uses the UTC date, not the time of day', async () => {
    const early = await createDemoTournamentRepository({ now: at('2026-10-21') }).list()
    const late = await createDemoTournamentRepository({
      now: () => new Date('2026-10-21T23:59:59Z'),
    }).list()

    expect(late).toEqual(early)
  })
})
